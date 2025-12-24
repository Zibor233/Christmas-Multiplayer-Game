import * as THREE from 'three'
import type { DecorationState, PlayerState } from './constants'
import { ChristmasTree } from './Tree'
import { Player } from './Player'
import { Environment } from './Environment'

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export class World {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  composer: EffectComposer
  clock = new THREE.Clock()

  players: Map<string, Player> = new Map()
  localPlayerId: string | null = null
  tree: ChristmasTree
  env: Environment
  onTreeClick: ((slot: { angle: number; height: number }) => void) | null = null

  public orbitAngle = 0
  private orbitSpeed = 0.14
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()

  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x050a14)
    // Deep blue-purple fog for atmosphere
    this.scene.fog = new THREE.FogExp2(0x050a14, 0.02)

    this.camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 200)
    this.camera.position.set(0, 6, 15)
    this.camera.lookAt(0, 2.0, 0)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.useLegacyLights = false
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.touchAction = 'none'

    // --- Post Processing ---
    this.composer = new EffectComposer(this.renderer)
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.8, // strength
      0.5, // radius
      0.8  // threshold
    )
    this.composer.addPass(bloomPass)
    // -----------------------

    // --- Lighting ---
    const ambient = new THREE.AmbientLight(0x405080, 0.8) // Cool ambient
    this.scene.add(ambient)

    // Main Moon Light (Directional)
    const moonLight = new THREE.DirectionalLight(0xaaccff, 2.0)
    moonLight.position.set(-10, 20, -10)
    moonLight.castShadow = true
    moonLight.shadow.mapSize.width = 2048
    moonLight.shadow.mapSize.height = 2048
    moonLight.shadow.camera.near = 0.5
    moonLight.shadow.camera.far = 50
    moonLight.shadow.bias = -0.001
    const d = 25
    moonLight.shadow.camera.left = -d
    moonLight.shadow.camera.right = d
    moonLight.shadow.camera.top = d
    moonLight.shadow.camera.bottom = -d
    this.scene.add(moonLight)

    // Warm Tree Light (Point)
    const treeLight = new THREE.PointLight(0xffaa55, 10, 20)
    treeLight.position.set(2, 6, 2)
    treeLight.castShadow = true
    treeLight.shadow.bias = -0.0001
    this.scene.add(treeLight)

    // Fill Light (Purple/Blue)
    const fillLight = new THREE.PointLight(0x8844ff, 5, 25)
    fillLight.position.set(-8, 5, 8)
    this.scene.add(fillLight)
    // ----------------

    // Ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(40, 64),
      new THREE.MeshStandardMaterial({ 
        color: 0xeeeeff, 
        roughness: 0.9, 
        metalness: 0.2,
      })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0
    ground.receiveShadow = true
    this.scene.add(ground)

    // Grid (optional, keep faint)
    const grid = new THREE.GridHelper(60, 60, 0x223355, 0x111e33)
    grid.position.y = 0.01
    grid.material.transparent = true
    grid.material.opacity = 0.15
    this.scene.add(grid)

    this.tree = new ChristmasTree()
    this.tree.group.position.set(0, 0, 0)
    this.scene.add(this.tree.group)

    this.env = new Environment()
    this.scene.add(this.env.group)

    window.addEventListener('resize', this.onResize)
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
  }


  dispose() {
    window.removeEventListener('resize', this.onResize)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.dispose()
    this.container.innerHTML = ''
  }

  onResize = () => {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  onPointerDown = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    this.pointer.set(x, y)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.tree.intersect(this.raycaster)
    if (!hit) return
    const slot = this.tree.slotFromWorldPoint(hit.point)
    this.onTreeClick?.(slot)
  }

  addPlayer(id: string, name: string, isLocal: boolean) {
    const p = new Player(id, name, isLocal)
    this.players.set(id, p)
    this.scene.add(p.group)
  }

  removePlayer(id: string) {
    const p = this.players.get(id)
    if (!p) return
    p.group.removeFromParent()
    this.players.delete(id)
  }

  updateFromSnapshot(players: PlayerState[], decorations: DecorationState[]) {
    const serverIds = new Set(players.map((p) => p.id))
    for (const id of this.players.keys()) {
      if (!serverIds.has(id)) this.removePlayer(id)
    }

    for (const ps of players) {
      const isLocal = this.localPlayerId === ps.id
      let p = this.players.get(ps.id)
      if (!p) {
        this.addPlayer(ps.id, ps.name, isLocal)
        p = this.players.get(ps.id)!
      }
      p.isLocal = isLocal
      p.name = ps.name
      p.vx = ps.vx
      p.vz = ps.vz
      p.placedCount = ps.placed_count
      p.setHat(!!ps.cosmetic?.hat)
      if (isLocal) {
        p.x = ps.x
        p.z = ps.z
        p.updateMesh()
      } else {
        p.setTargetPosition(ps.x, ps.z)
      }
    }

    this.tree.updateFromSnapshot(decorations)
  }

  addDecoration(d: DecorationState) {
    this.tree.upsertDecoration(d)
  }

  update(dt: number) {
    for (const p of this.players.values()) p.update(dt)

    this.tree.update(dt)
    this.env.update(dt)

    const center = new THREE.Vector3(0, 2.0, 0)
    const radius = 15
    const height = 6.0
    const local = this.localPlayerId ? this.players.get(this.localPlayerId) : undefined
    if (local) {
      // Always update camera to follow player to prevent occlusion
      const desired = Math.atan2(local.x, local.z)
      this.orbitAngle = this.lerpAngle(this.orbitAngle, desired, Math.min(1, dt * 3.5))
    } else {
      this.orbitAngle += dt * this.orbitSpeed
    }

    const camBase = new THREE.Vector3(Math.sin(this.orbitAngle) * radius, height, Math.cos(this.orbitAngle) * radius)
    camBase.add(center)
    this.camera.position.lerp(camBase, Math.min(1, dt * 2.2))
    this.camera.lookAt(center)

    this.composer.render()
  }

  private lerpAngle(a: number, b: number, t: number) {
    const d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
    return a + d * t
  }
}
