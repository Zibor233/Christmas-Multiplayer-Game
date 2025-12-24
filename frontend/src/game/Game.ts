import { InputManager } from './Input'
import { NetworkClient } from './Network'
import type { DecorationType, InputPayload, ServerSnapshotPayload } from './constants'
import { INPUT_RATE_LIMIT_HZ } from './constants'
import { World } from './World'

export type ChatMessage = {
  id: string
  room_id: string
  player_id: string
  name: string
  text: string
  server_time_ms: number
}

export type HudState = {
  roomId: string
  phase: string
  treeDecorationCount: number
  localPlacedCount: number
  localHat: boolean
}

export class GameEngine {
  network: NetworkClient
  input: InputManager
  world: World

  isRunning = false
  lastTime = 0
  localPlayerId: string | null = null
  pendingInputs: InputPayload[] = []
  lastInputTime = 0
  readonly inputInterval = 1000 / INPUT_RATE_LIMIT_HZ

  private onHud: ((hud: HudState) => void) | null = null
  private onChat: ((msg: ChatMessage) => void) | null = null
  private onChatClear: (() => void) | null = null
  private lastHudSerialized = ''
  private cachedHud: HudState | null = null
  private hat = false
  private activeDecorationType: DecorationType = 'bell'

  constructor(
    container: HTMLElement,
    playerName: string,
    roomId: string,
    onHud?: (hud: HudState) => void,
    onChat?: (msg: ChatMessage) => void,
    onChatClear?: () => void
  ) {
    this.world = new World(container)
    this.input = new InputManager()
    this.network = new NetworkClient()
    this.onHud = onHud ?? null
    this.onChat = onChat ?? null
    this.onChatClear = onChatClear ?? null

    this.network.onMessage(this.handleMessage)
    this.network.connect(playerName, roomId)
    this.world.onTreeClick = (slot) => this.placeDecorationAt(slot)

    this.isRunning = true
    this.lastTime = performance.now()
    requestAnimationFrame(this.loop)
  }

  cleanup(container: HTMLElement) {
    this.isRunning = false
    this.network.disconnect()
    this.input.dispose()
    this.world.dispose()
    container.innerHTML = ''
  }

  handleMessage = (type: string, payload: any) => {
    if (type === 'welcome') {
      this.localPlayerId = payload.player_id
      this.world.localPlayerId = payload.player_id
    } else if (type === 'state.snapshot') {
      this.onServerSnapshot(payload as ServerSnapshotPayload)
    } else if (type === 'tree.placed') {
      if (payload && typeof payload === 'object') {
        this.world.addDecoration(payload as any)
        // Optimistically update local count if it was us (or just update HUD from snapshot later)
        // But for smoothness, we rely on snapshot for counts, visual is immediate.
      }
    } else if (type === 'chat.message') {
      if (payload && typeof payload === 'object') this.onChat?.(payload as ChatMessage)
    } else if (type === 'chat.history') {
      const msgs = payload?.messages
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          if (m && typeof m === 'object') this.onChat?.(m as ChatMessage)
        }
      }
    } else if (type === 'chat.cleared') {
      this.onChatClear?.()
    }
  }

  private onServerSnapshot(snapshot: ServerSnapshotPayload) {
    this.world.updateFromSnapshot(snapshot.players, snapshot.tree?.decorations ?? [])

    const local = this.localPlayerId ? snapshot.players.find((p) => p.id === this.localPlayerId) : undefined
    const hud: HudState = {
      roomId: snapshot.room_id,
      phase: snapshot.phase,
      treeDecorationCount: snapshot.tree?.decorations?.length ?? 0,
      localPlacedCount: local?.placed_count ?? 0,
      localHat: !!local?.cosmetic?.hat
    }
    this.updateHud(hud)
  }

  private updateHud(hud: HudState) {
    if (!this.onHud) return
    const s = JSON.stringify(hud)
    if (s === this.lastHudSerialized) return
    this.lastHudSerialized = s
    this.cachedHud = hud
    this.onHud(hud)
  }

  loop = (time: number) => {
    if (!this.isRunning) return
    const dt = (time - this.lastTime) / 1000
    this.lastTime = time
    this.update(dt, time)
    this.world.update(dt)
    requestAnimationFrame(this.loop)
  }

  update(dt: number, time: number) {
    if (!this.localPlayerId) return
    const axis = this.input.getInput()

    // Rotate input to match camera angle
    const angle = this.world.orbitAngle
    const s = Math.sin(angle)
    const c = Math.cos(angle)
    
    // Forward (z=-1) should move along camera forward vector (-sin, -cos)
    // Right (x=1) should move along camera right vector (cos, -sin)
    const rx = axis.x * c + axis.z * s
    const rz = -axis.x * s + axis.z * c
    const rotatedAxis = { x: rx, z: rz }

    const player = this.world.players.get(this.localPlayerId)
    if (player) player.applyInput(dt, rotatedAxis, 3.5)

    if (time - this.lastInputTime >= this.inputInterval) {
      this.input.seq++
      const payload: InputPayload = {
        seq: this.input.seq,
        ax: rotatedAxis.x,
        az: rotatedAxis.z,
        client_time_ms: Math.floor(time)
      }
      this.pendingInputs.push(payload)
      this.network.send('input.move', payload)
      this.lastInputTime = time
    }
  }

  toggleHat() {
    this.hat = !this.hat
    this.network.send('player.cosmetic', { hat: this.hat })
    if (this.cachedHud) this.updateHud({ ...this.cachedHud, localHat: this.hat })
  }

  placeDecoration(type: DecorationType) {
    this.activeDecorationType = type
    const slot = { angle: Math.random() * Math.PI * 2, height: 0.18 + Math.random() * 0.82 }
    this.network.send('tree.place', { type, slot })
  }

  placeDecorationAt(slot: { angle: number; height: number }) {
    this.network.send('tree.place', { type: this.activeDecorationType, slot })
  }

  sendChat(text: string) {
    this.network.send('chat.send', { text })
  }

  clearChat(password: string) {
    this.network.send('chat.clear', { password })
  }
}
