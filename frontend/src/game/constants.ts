export const SERVER_TICK_HZ = 20
export const SNAPSHOT_HZ = 15
export const INPUT_RATE_LIMIT_HZ = 30
export const PLAYER_MAX_SPEED = 3.5

export const WORLD_MIN_X = -14.0
export const WORLD_MAX_X = 14.0
export const WORLD_MIN_Z = -14.0
export const WORLD_MAX_Z = 14.0

export const WS_PATH = '/ws'
export const WS_URL = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + WS_PATH

export type DecorationType = 'bell' | 'mini_hat' | 'tinsel'

export interface DecorationState {
  id: string
  type: DecorationType
  angle: number
  height: number
  placed_by: string
  placed_ms: number
}

export interface PlayerState {
  id: string
  x: number
  z: number
  vx: number
  vz: number
  name: string
  cosmetic: { hat: boolean }
  placed_count: number
}

export interface ServerSnapshotPayload {
  server_time_ms: number
  players: PlayerState[]
  ack: Record<string, number>
  room_id: string
  phase: string
  tree: { decorations: DecorationState[] }
}

export interface InputPayload {
  seq: number
  ax: number
  az: number
  client_time_ms: number
}
