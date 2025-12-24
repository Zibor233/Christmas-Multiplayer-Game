export type InputState = { x: number; z: number }

export class InputManager {
  keys: Record<string, boolean> = {}
  seq = 0

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }

  onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true
  }

  onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false
  }

  getInput(): InputState {
    let x = 0
    let z = 0
    if (this.keys['KeyW'] || this.keys['ArrowUp']) z -= 1
    if (this.keys['KeyS'] || this.keys['ArrowDown']) z += 1
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1

    const mag = Math.hypot(x, z)
    if (mag > 1) {
      x /= mag
      z /= mag
    }
    return { x, z }
  }
}

