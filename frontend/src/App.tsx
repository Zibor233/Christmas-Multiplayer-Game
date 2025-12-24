import { useEffect, useMemo, useRef, useState } from 'react'
import { Lobby } from './components/Lobby'
import { GameEngine, type ChatMessage, type HudState } from './game/Game'

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<GameEngine | null>(null)
  const [gameState, setGameState] = useState<'LOBBY' | 'PLAYING'>('LOBBY')
  const [playerName, setPlayerName] = useState('')
  const [roomId, setRoomId] = useState('public')
  const [hud, setHud] = useState<HudState | null>(null)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [showAdmin, setShowAdmin] = useState(false)
  const chatSeenRef = useRef<Set<string>>(new Set())
  const chatSeqRef = useRef(0)

  useEffect(() => {
    return () => {
      if (gameRef.current && containerRef.current) {
        gameRef.current.cleanup(containerRef.current)
      }
      gameRef.current = null
    }
  }, [])

  const handleJoin = (name: string, room: string) => {
    setPlayerName(name)
    setRoomId(room)
    setChat([])
    chatSeenRef.current.clear()
    chatSeqRef.current = 0
    setGameState('PLAYING')
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
      gameRef.current = new GameEngine(
        containerRef.current,
        name,
        room,
        setHud,
        (m) => {
          setChat((prev) => {
            if (prev.some((p) => p.id === m.id)) return prev
            const newChat = [...prev, m]
            if (newChat.length > 80) {
              return newChat.slice(-60)
            }
            return newChat
          })
        },
        () => {
          setChat([])
          chatSeenRef.current.clear()
        }
      )
    }
  }

  const onSendChat = () => {
    const text = chatDraft.trim()
    if (!text) return
    setChatDraft('')
    gameRef.current?.sendChat(text)
  }

  const onAdminClear = () => {
    if (!adminPassword) return
    gameRef.current?.clearChat(adminPassword)
    setShowAdmin(false)
  }

  const decorationButtons = useMemo(() => {
    return [
      { type: 'bell' as const, label: '挂铃铛' },
      { type: 'mini_hat' as const, label: '挂小帽子' },
      { type: 'tinsel' as const, label: '挂彩条' }
    ]
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div
        id="canvas-container"
        ref={containerRef}
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
      />

      <div id="ui-layer" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
        {gameState === 'LOBBY' && <Lobby onJoin={handleJoin} />}

        {gameState === 'PLAYING' && (
          <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px' }}>
              <div style={{ pointerEvents: 'none', color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.7)' }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#ff445a' }}>🎄 圣诞联机装修树</div>
                <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '6px' }}>
                  房间: <span style={{ color: '#ffd700', fontWeight: 700 }}>{roomId}</span> ｜ 玩家:{' '}
                  <span style={{ color: '#ffd700', fontWeight: 700 }}>{playerName}</span>
                </div>
              </div>

              {hud && (
                <div
                  className="interactive"
                  style={{
                    pointerEvents: 'auto',
                    width: '280px',
                    background: 'rgba(0,0,0,0.55)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: '12px',
                    padding: '12px',
                    backdropFilter: 'blur(10px)',
                    color: 'white'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 800, color: '#ffd700' }}>✨ 装饰</div>
                    <div style={{ fontSize: '12px', opacity: 0.9 }}>树上: {hud.treeDecorationCount}</div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    {decorationButtons.map((b) => (
                      <button
                        key={b.type}
                        onClick={() => gameRef.current?.placeDecoration(b.type)}
                        style={{
                          flex: 1,
                          padding: '10px 8px',
                          borderRadius: '10px',
                          border: '1px solid rgba(255,255,255,0.2)',
                          background: 'rgba(255,255,255,0.08)',
                          color: 'white',
                          cursor: 'pointer'
                        }}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      onClick={() => gameRef.current?.toggleHat()}
                      style={{
                        flex: 1,
                        padding: '10px 8px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: hud.localHat ? 'rgba(255, 68, 90, 0.28)' : 'rgba(255,255,255,0.08)',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 700
                      }}
                    >
                      {hud.localHat ? '摘下圣诞帽' : '戴上圣诞帽'}
                    </button>
                    <div
                      style={{
                        width: '88px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        opacity: 0.9
                      }}
                    >
                      我的放置: {hud.localPlacedCount}
                    </div>
                  </div>

                  <div style={{ marginTop: '10px', fontSize: '12px', opacity: 0.9, lineHeight: 1.5 }}>
                    WASD 移动，走近圣诞树后再挂装饰
                  </div>
                </div>
              )}
            </div>

            <div style={{ position: 'absolute', left: 16, bottom: 16, width: 360, pointerEvents: 'none' }}>
              <div
                className="interactive"
                style={{
                  pointerEvents: 'auto',
                  background: 'rgba(0,0,0,0.55)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '12px',
                  padding: '10px',
                  backdropFilter: 'blur(10px)',
                  color: 'white'
                }}
              >
                <div style={{ fontWeight: 800, color: '#ffd700' }}>💬 聊天</div>
                <div style={{ marginTop: '8px', height: 140, overflow: 'auto', fontSize: '13px', lineHeight: 1.5 }}>
                  {chat.slice(-40).map((m, i) => (
                    <div key={`${m.id}-${i}`} style={{ opacity: 0.95 }}>
                      <span style={{ color: '#9ad1ff', fontWeight: 700 }}>{m.name}</span>: {m.text}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <input
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onSendChat()
                    }}
                    placeholder="打字聊天…"
                    maxLength={120}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.08)',
                      color: 'white',
                      outline: 'none'
                    }}
                  />
                  <button
                    onClick={onSendChat}
                    style={{
                      width: 80,
                      padding: '10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255, 68, 90, 0.28)',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 800
                    }}
                  >
                    发送
                  </button>
                </div>
                
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  {!showAdmin ? (
                    <button
                      onClick={() => setShowAdmin(true)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      管理员
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px', width: '100%', alignItems: 'center' }}>
                      <input
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="管理员密码"
                        type="password"
                        style={{
                          flex: 1,
                          padding: '6px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(0,0,0,0.3)',
                          color: 'white',
                          fontSize: '11px',
                          outline: 'none'
                        }}
                      />
                      <button
                        onClick={onAdminClear}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,0,0,0.3)',
                          background: 'rgba(255,0,0,0.2)',
                          color: '#ffaaaa',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        清空
                      </button>
                      <button
                        onClick={() => setShowAdmin(false)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'rgba(255,255,255,0.4)',
                          fontSize: '16px',
                          cursor: 'pointer',
                          padding: '0 4px'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
