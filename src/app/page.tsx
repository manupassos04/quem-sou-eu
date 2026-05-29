'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 5; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

export default function HomePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'choose' | 'join'>('choose')
  const [roomCode, setRoomCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function createRoom() {
    if (!name.trim()) { setError('Digite seu nome primeiro!'); return }
    setLoading(true)
    setError('')

    const code = generateCode()
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .insert({ code, status: 'lobby' })
      .select()
      .single()

    if (roomErr || !room) {
      setError('Erro ao criar sala. Tente novamente.')
      setLoading(false)
      return
    }

    const { data: player } = await supabase
      .from('players')
      .insert({ room_id: room.id, name: name.trim() })
      .select()
      .single()

    if (!player) { setError('Erro ao entrar. Tente novamente.'); setLoading(false); return }

    await supabase.from('rooms').update({ host_player_id: player.id }).eq('id', room.id)

    localStorage.setItem(`room_${code}_playerId`, player.id)
    router.push(`/room/${code}`)
  }

  async function joinRoom() {
    if (!name.trim()) { setError('Digite seu nome primeiro!'); return }
    if (!roomCode.trim()) { setError('Digite o código da sala!'); return }
    setLoading(true)
    setError('')

    const code = roomCode.toUpperCase().trim()
    const { data: room } = await supabase.from('rooms').select('*').eq('code', code).single()

    if (!room) { setError('Sala não encontrada. Verifique o código.'); setLoading(false); return }
    if (room.status !== 'lobby') { setError('Esse jogo já começou! 😅'); setLoading(false); return }

    const { data: player } = await supabase
      .from('players')
      .insert({ room_id: room.id, name: name.trim() })
      .select()
      .single()

    if (!player) { setError('Erro ao entrar. Tente novamente.'); setLoading(false); return }

    localStorage.setItem(`room_${code}_playerId`, player.id)
    router.push(`/room/${code}`)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0f0a1e] via-[#1a0533] to-[#0d0d2b] flex items-center justify-center p-4">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500 rounded-full opacity-10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-pink-500 rounded-full opacity-10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500 rounded-full opacity-5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="text-8xl mb-3 float-anim inline-block">🎭</div>
          <h1 className="text-5xl font-black text-white tracking-tight mb-2">
            Quem Sou Eu?
          </h1>
          <p className="text-purple-300 text-lg">
            O jogo da testa para jogar com o time!
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-7 border border-purple-500/20 shadow-2xl shadow-purple-900/30">
          <div className="mb-5">
            <label className="text-purple-200 font-semibold text-sm uppercase tracking-wider mb-2 block">
              Seu nome
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (mode === 'join' ? joinRoom() : createRoom())}
              placeholder="Como te chamam?"
              maxLength={20}
              className="w-full bg-white/10 text-white placeholder-white/30 border-2 border-purple-500/30 rounded-2xl px-5 py-3.5 text-lg focus:border-purple-400 focus:bg-white/15 transition-all"
              autoFocus
            />
          </div>

          {mode === 'join' && (
            <div className="mb-5">
              <label className="text-purple-200 font-semibold text-sm uppercase tracking-wider mb-2 block">
                Código da sala
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && joinRoom()}
                placeholder="ABCDE"
                maxLength={5}
                className="w-full bg-white/10 text-white placeholder-white/30 border-2 border-pink-500/30 rounded-2xl px-5 py-3.5 text-2xl text-center font-mono tracking-[0.5em] uppercase focus:border-pink-400 focus:bg-white/15 transition-all"
              />
            </div>
          )}

          {error && (
            <div className="mb-4 text-red-300 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {mode === 'choose' ? (
            <div className="flex gap-3">
              <button
                onClick={createRoom}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-bold py-4 rounded-2xl text-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 shadow-lg shadow-purple-900/50"
              >
                {loading ? '⏳' : '✨ Criar Sala'}
              </button>
              <button
                onClick={() => { setMode('join'); setError('') }}
                disabled={loading}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-2xl text-lg transition-all transform hover:scale-105 active:scale-95 border-2 border-white/10"
              >
                🚪 Entrar
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={joinRoom}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold py-4 rounded-2xl text-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 shadow-lg shadow-pink-900/50"
              >
                {loading ? '⏳' : '🎉 Entrar na Sala'}
              </button>
              <button
                onClick={() => { setMode('choose'); setError(''); setRoomCode('') }}
                className="bg-white/10 hover:bg-white/20 text-white font-bold py-4 px-5 rounded-2xl text-lg transition-all"
              >
                ←
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-6 mt-6 text-white/30 text-sm">
          <span>📱 Funciona no celular</span>
          <span>🔗 Compartilhe o link</span>
        </div>
      </div>
    </main>
  )
}
