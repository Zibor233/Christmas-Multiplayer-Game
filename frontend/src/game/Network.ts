import { WS_URL } from './constants'

type MessageHandler = (type: string, payload: any) => void

export class NetworkClient {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private isDisposed = false

  connect(name: string, roomId: string) {
    this.isDisposed = false
    if (this.ws) this.ws.close()

    this.ws = new WebSocket(WS_URL)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.send('hello', { name, room_id: roomId })
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.emit(data.type, data.payload)
      } catch (e) {
        console.error('Failed to parse message:', event.data)
      }
    }

    this.ws.onclose = () => {
      if (this.isDisposed) return
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        const attempt = this.reconnectAttempts + 1
        setTimeout(() => {
          this.reconnectAttempts = attempt
          this.connect(name, roomId)
        }, 2000 * attempt)
      }
    }
  }

  send(type: string, payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private emit(type: string, payload: any) {
    this.handlers.forEach((h) => h(type, payload))
  }

  disconnect() {
    this.isDisposed = true
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}
