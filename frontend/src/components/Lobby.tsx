import React, { useState } from 'react'

interface LobbyProps {
  onJoin: (name: string, roomId: string) => void
}

export const Lobby: React.FC<LobbyProps> = ({ onJoin }) => {
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('public')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    const r = roomId.trim() || 'public'
    if (!n) return
    onJoin(n, r)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        pointerEvents: 'auto',
        backdropFilter: 'blur(10px)'
      }}
    >
      <h1 style={{ color: '#d32f2f', fontSize: '2.5rem', marginBottom: '1.6rem' }}>🎄 圣诞联机装修树 🎄</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '320px' }}>
        <input
          type="text"
          placeholder="输入昵称…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: '0.8rem',
            fontSize: '1.1rem',
            borderRadius: '10px',
            border: '2px solid #ddd',
            outline: 'none'
          }}
          maxLength={16}
        />

        <input
          type="text"
          placeholder="房间号（默认 public）"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          style={{
            padding: '0.8rem',
            fontSize: '1.0rem',
            borderRadius: '10px',
            border: '2px solid #ddd',
            outline: 'none'
          }}
          maxLength={32}
        />

        <button
          type="submit"
          style={{
            padding: '1rem',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            backgroundColor: '#d32f2f',
            color: 'white',
            border: 'none',
            borderRadius: '10px'
          }}
        >
          进入雪地
        </button>
      </form>
      <div style={{ marginTop: '1.6rem', color: '#666', textAlign: 'center', lineHeight: '1.6' }}>
        <p>⌨️ WASD 移动 ｜ 🎄 走近树再挂装饰 ｜ 💬 可打字聊天</p>
      </div>
    </div>
  )
}
