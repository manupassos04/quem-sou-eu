'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type GameStatus = 'lobby' | 'assigning' | 'playing' | 'finished'

interface Room {
  id: string
  code: string
  status: GameStatus
  host_player_id: string
  current_turn_seat: number
}

interface Player {
  id: string
  room_id: string
  name: string
  seat_order: number | null
  character: string | null
  is_eliminated: boolean
}

const COLORS = [
  { bg: 'from-violet-500 to-purple-600', shadow: 'shadow-purple-500/40', ring: 'ring-purple-400' },
  { bg: 'from-pink-500 to-rose-600',     shadow: 'shadow-pink-500/40',   ring: 'ring-pink-400' },
  { bg: 'from-orange-400 to-red-500',    shadow: 'shadow-orange-500/40', ring: 'ring-orange-400' },
  { bg: 'from-emerald-400 to-teal-600',  shadow: 'shadow-emerald-500/40',ring: 'ring-emerald-400' },
  { bg: 'from-sky-400 to-blue-600',      shadow: 'shadow-sky-500/40',    ring: 'ring-sky-400' },
  { bg: 'from-yellow-400 to-amber-500',  shadow: 'shadow-yellow-500/40', ring: 'ring-yellow-400' },
  { bg: 'from-fuchsia-500 to-pink-700',  shadow: 'shadow-fuchsia-500/40',ring: 'ring-fuchsia-400' },
  { bg: 'from-cyan-400 to-teal-500',     shadow: 'shadow-cyan-500/40',   ring: 'ring-cyan-400' },
]

function getColor(index: number) {
  return COLORS[index % COLORS.length]
}

function Avatar({ name, colorIndex, size = 'md' }: { name: string, colorIndex: number, size?: 'sm' | 'md' | 'lg' }) {
  const color = getColor(colorIndex)
  const sizes = { sm: 'w-9 h-9 text-base', md: 'w-12 h-12 text-xl', lg: 'w-16 h-16 text-2xl' }
  return (
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br ${color.bg} flex items-center justify-center text-white font-black shadow-lg ${color.shadow} shadow-md flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    color: ['#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#f97316'][i % 6],
    delay: `${Math.random() * 2}s`,
    duration: `${2 + Math.random() * 2}s`,
    size: `${6 + Math.random() * 8}px`,
    shape: Math.random() > 0.5 ? '50%' : '2px',
  }))

  return (
    <>
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left,
            top: '-20px',
            backgroundColor: p.color,
            width: p.size,
            height: p.size,
            borderRadius: p.shape,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </>
  )
}

export default function RoomPage() {
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [characterInput, setCharacterInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)

  const [copied, setCopied] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  const roomRef = useRef<Room | null>(null)
  roomRef.current = room

  const fetchPlayers = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at')
    if (data) setPlayers(data)
  }, [])

  useEffect(() => {
    const storedId = localStorage.getItem(`room_${code}_playerId`)
    if (storedId) setMyPlayerId(storedId)

    let channel: ReturnType<typeof supabase.channel>

    async function init() {
      const { data: roomData } = await supabase
        .from('rooms').select('*').eq('code', code).single()

      if (!roomData) { setError('Sala não encontrada 😕'); setLoading(false); return }

      setRoom(roomData)
      await fetchPlayers(roomData.id)
      setLoading(false)

      channel = supabase.channel(`room:${code}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
          (p) => setRoom(p.new as Room))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomData.id}` },
          () => fetchPlayers(roomData.id))
        .subscribe()
    }

    init()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [code, fetchPlayers])

  // Auto-advance to playing when everyone has assigned
  useEffect(() => {
    if (room?.status !== 'assigning' || players.length < 2) return
    const allDone = players.every(p => p.character !== null && p.character !== '')
    if (allDone) {
      supabase.from('rooms').update({ status: 'playing' }).eq('id', room.id).eq('status', 'assigning').then()
    }
  }, [players, room])

  // Confetti when game finishes
  useEffect(() => {
    if (room?.status === 'finished') {
      setShowConfetti(true)
      const t = setTimeout(() => setShowConfetti(false), 5000)
      return () => clearTimeout(t)
    }
  }, [room?.status])

  const me = players.find(p => p.id === myPlayerId)
  const isHost = room?.host_player_id === myPlayerId
  const sorted = [...players].sort((a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0))
  const myPos = sorted.findIndex(p => p.id === myPlayerId)
  const n = sorted.length
  const targetPlayer = n > 0 && myPos >= 0 ? sorted[(myPos - 1 + n) % n] : null
  const alreadyAssigned = targetPlayer?.character != null && targetPlayer.character !== ''
  const assignedCount = players.filter(p => p.character !== null && p.character !== '').length
  const currentTurnSeat = room?.current_turn_seat ?? 0
  const currentTurnPlayer = sorted[currentTurnSeat] ?? sorted[0]
  const isMyTurn = currentTurnPlayer?.id === myPlayerId

  async function handleJoin() {
    if (!joinName.trim() || !room) return
    setJoining(true)
    const { data: player } = await supabase
      .from('players').insert({ room_id: room.id, name: joinName.trim() }).select().single()
    if (player) {
      localStorage.setItem(`room_${code}_playerId`, player.id)
      setMyPlayerId(player.id)
    }
    setJoining(false)
  }

  async function handleStartGame() {
    if (!room || players.length < 2) return
    const shuffled = [...players].sort(() => Math.random() - 0.5)
    await Promise.all(shuffled.map((p, i) =>
      supabase.from('players').update({ seat_order: i }).eq('id', p.id)
    ))
    await supabase.from('rooms').update({ status: 'assigning' }).eq('id', room.id)
  }

  async function handleAssign() {
    if (!characterInput.trim() || !targetPlayer || alreadyAssigned) return
    setSubmitting(true)
    await supabase.from('players').update({ character: characterInput.trim() }).eq('id', targetPlayer.id)
    setCharacterInput('')
    setSubmitting(false)
  }

  async function handleNextTurn() {
    if (!room) return
    let nextSeat = (currentTurnSeat + 1) % n
    let attempts = 0
    while (sorted[nextSeat]?.is_eliminated && attempts < n) {
      nextSeat = (nextSeat + 1) % n
      attempts++
    }
    await supabase.from('rooms').update({ current_turn_seat: nextSeat }).eq('id', room.id)
  }

  async function handleGuessed(playerId: string) {
    if (!room) return
    await supabase.from('players').update({ is_eliminated: true }).eq('id', playerId)

    const stillPlaying = players.filter(p => !p.is_eliminated && p.id !== playerId)
    if (stillPlaying.length === 0) {
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id)
      return
    }

    // Se era a vez do jogador que acertou, passa para o próximo
    const wasTheirTurn = currentTurnPlayer?.id === playerId
    if (wasTheirTurn) {
      let nextSeat = (currentTurnSeat + 1) % n
      let attempts = 0
      while ((sorted[nextSeat]?.is_eliminated || sorted[nextSeat]?.id === playerId) && attempts < n) {
        nextSeat = (nextSeat + 1) % n
        attempts++
      }
      await supabase.from('rooms').update({ current_turn_seat: nextSeat }).eq('id', room.id)
    }
  }

  async function handleNewGame() {
    if (!room) return
    await Promise.all(players.map(p =>
      supabase.from('players').update({ character: null, is_eliminated: false, seat_order: null }).eq('id', p.id)
    ))
    await supabase.from('rooms').update({ status: 'lobby' }).eq('id', room.id)
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0a1e] via-[#1a0533] to-[#0d0d2b] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 float-anim">🎭</div>
          <p className="text-white/60 text-lg">Carregando sala...</p>
        </div>
      </div>
    )
  }

  // --- Error ---
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0a1e] via-[#1a0533] to-[#0d0d2b] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-white text-2xl font-bold mb-4">{error}</h1>
          <a href="/" className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-2xl transition-all">
            Voltar ao início
          </a>
        </div>
      </div>
    )
  }

  // --- Join form (person opened link but not in localStorage) ---
  if (!myPlayerId) {
    if (room?.status !== 'lobby') {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#0f0a1e] via-[#1a0533] to-[#0d0d2b] flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-6xl mb-4">🎮</div>
            <h1 className="text-white text-2xl font-bold mb-2">Jogo já começou!</h1>
            <p className="text-white/50 mb-6">Você chegou tarde demais para esta rodada.</p>
            <a href="/" className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-2xl transition-all">
              Criar nova sala
            </a>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0a1e] via-[#1a0533] to-[#0d0d2b] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-6xl mb-2 float-anim inline-block">🎉</div>
            <h1 className="text-white text-3xl font-black mb-1">Entrar na Sala</h1>
            <p className="text-purple-300">
              Código: <span className="font-mono font-bold text-white tracking-widest">{code}</span>
            </p>
          </div>
          <div className="bg-white/5 rounded-3xl p-6 border border-purple-500/20">
            <input
              type="text"
              value={joinName}
              onChange={e => setJoinName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="Seu nome"
              maxLength={20}
              className="w-full bg-white/10 text-white placeholder-white/30 border-2 border-purple-500/30 rounded-2xl px-5 py-3.5 text-lg mb-4 focus:border-purple-400 transition-all"
              autoFocus
            />
            <button
              onClick={handleJoin}
              disabled={joining || !joinName.trim()}
              className="w-full bg-gradient-to-r from-purple-600 to-violet-600 text-white font-bold py-4 rounded-2xl text-lg disabled:opacity-50 hover:from-purple-500 hover:to-violet-500 transition-all transform hover:scale-105 active:scale-95"
            >
              {joining ? '⏳ Entrando...' : '🎮 Entrar no Jogo'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0a1e] via-[#1a0533] to-[#0d0d2b]">
      {showConfetti && <Confetti />}

      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500 rounded-full opacity-10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-pink-500 rounded-full opacity-10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 p-4 flex items-center justify-between border-b border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎭</span>
          <span className="text-white font-black text-lg hidden sm:block">Quem Sou Eu?</span>
        </div>
        <button
          onClick={copyLink}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-mono font-bold px-4 py-2 rounded-xl text-sm transition-all"
        >
          <span className="tracking-widest">{code}</span>
          <span className="text-xs">{copied ? '✅' : '📋'}</span>
        </button>
      </header>

      <main className="relative z-10 p-4 max-w-xl mx-auto pb-20">

        {/* ===== LOBBY ===== */}
        {room?.status === 'lobby' && (
          <div className="mt-6">
            <div className="text-center mb-8">
              <p className="text-purple-300 text-sm uppercase tracking-widest font-semibold mb-1">Sala aberta</p>
              <h2 className="text-white text-3xl font-black mb-2">Aguardando jogadores</h2>
              <p className="text-white/40 text-sm">Compartilhe o código <strong className="text-white font-mono">{code}</strong> para seus amigos entrarem</p>
            </div>

            {/* Players list */}
            <div className="space-y-3 mb-8">
              {players.map((player, i) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-4 bg-white/5 rounded-2xl p-4 border ${player.id === myPlayerId ? 'border-purple-400/50' : 'border-white/10'} pop-in`}
                >
                  <Avatar name={player.name} colorIndex={i} />
                  <div className="flex-1">
                    <p className="text-white font-bold text-lg">{player.name}</p>
                    {room.host_player_id === player.id && (
                      <p className="text-yellow-400 text-xs font-semibold">👑 Anfitrião</p>
                    )}
                  </div>
                  {player.id === myPlayerId && (
                    <span className="text-purple-400 text-xs font-semibold bg-purple-500/10 px-2 py-1 rounded-lg">Você</span>
                  )}
                </div>
              ))}

              {players.length < 2 && (
                <div className="text-center py-6 text-white/30">
                  <div className="text-3xl mb-2">⏳</div>
                  <p>Esperando mais jogadores...</p>
                  <p className="text-sm mt-1">Mínimo 2 jogadores para começar</p>
                </div>
              )}
            </div>

            {/* Share button */}
            <button
              onClick={copyLink}
              className="w-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-semibold py-3 rounded-2xl border border-white/10 transition-all mb-3 flex items-center justify-center gap-2"
            >
              {copied ? '✅ Link copiado!' : '🔗 Copiar link da sala'}
            </button>

            {/* Start button (host only) */}
            {isHost && (
              <button
                onClick={handleStartGame}
                disabled={players.length < 2}
                className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-black py-5 rounded-2xl text-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-purple-900/50 glow-anim"
              >
                {players.length < 2 ? '⏳ Esperando jogadores...' : `🚀 Iniciar Jogo (${players.length} jogadores)`}
              </button>
            )}

            {!isHost && (
              <div className="text-center text-white/40 py-3">
                Esperando o anfitrião iniciar o jogo...
              </div>
            )}
          </div>
        )}

        {/* ===== ASSIGNING ===== */}
        {room?.status === 'assigning' && (
          <div className="mt-6">
            <div className="text-center mb-8">
              <div className="text-5xl mb-3">✏️</div>
              <h2 className="text-white text-3xl font-black mb-2">Hora de escolher!</h2>
              <p className="text-purple-300">
                Cada um escolhe o personagem do colega à sua esquerda
              </p>
            </div>

            {alreadyAssigned ? (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">✅</div>
                <p className="text-white text-xl font-bold mb-2">Você já escolheu!</p>
                <p className="text-white/50 mb-6">
                  Aguardando os outros... ({assignedCount}/{players.length})
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {players.map((p, i) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
                        p.character ? 'bg-green-500/20 border-green-500/40 text-green-300' : 'bg-white/5 border-white/10 text-white/40'
                      }`}
                    >
                      <span>{p.character ? '✓' : '⏳'}</span>
                      <span className="font-semibold">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : targetPlayer ? (
              <div>
                {/* Target player card */}
                <div className={`rounded-3xl p-6 mb-6 bg-gradient-to-br ${getColor(sorted.findIndex(p => p.id === targetPlayer.id)).bg} shadow-2xl ${getColor(sorted.findIndex(p => p.id === targetPlayer.id)).shadow} shadow-xl`}>
                  <p className="text-white/70 text-sm font-semibold uppercase tracking-wider mb-2">
                    Escolha um personagem para...
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-4xl font-black text-white">
                      {targetPlayer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white text-3xl font-black">{targetPlayer.name}</p>
                      <p className="text-white/60 text-sm">está à sua esquerda 👈</p>
                    </div>
                  </div>
                </div>

                {/* Input */}
                <div className="bg-white/5 rounded-3xl p-6 border border-purple-500/20">
                  <label className="text-purple-200 font-semibold text-sm uppercase tracking-wider mb-3 block">
                    Qual personagem {targetPlayer.name} vai ser?
                  </label>
                  <input
                    type="text"
                    value={characterInput}
                    onChange={e => setCharacterInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAssign()}
                    placeholder="Ex: Lionel Messi, Darth Vader, Mickey Mouse..."
                    maxLength={50}
                    className="w-full bg-white/10 text-white placeholder-white/30 border-2 border-purple-500/30 rounded-2xl px-5 py-3.5 text-lg mb-4 focus:border-purple-400 transition-all"
                    autoFocus
                  />
                  <button
                    onClick={handleAssign}
                    disabled={submitting || !characterInput.trim()}
                    className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-black py-4 rounded-2xl text-lg disabled:opacity-50 transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-purple-900/50"
                  >
                    {submitting ? '⏳ Enviando...' : '🎯 Confirmar Personagem'}
                  </button>
                </div>

                <p className="text-center text-white/30 text-sm mt-4">
                  {assignedCount}/{players.length} jogadores já escolheram
                </p>
              </div>
            ) : (
              <p className="text-white/50 text-center">Carregando...</p>
            )}
          </div>
        )}

        {/* ===== PLAYING ===== */}
        {room?.status === 'playing' && (
          <div className="mt-6">

            {/* TURN BANNER */}
            {currentTurnPlayer && (
              <div className="mb-6">
                {isMyTurn && !me?.is_eliminated ? (
                  <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-3xl p-6 text-center shadow-2xl shadow-orange-900/50 glow-anim">
                    <p className="text-white/80 text-sm font-semibold uppercase tracking-widest mb-1">É a sua vez!</p>
                    <p className="text-white text-2xl font-black mb-1">🎤 Faça uma pergunta</p>
                    <p className="text-white/70 text-sm">Pergunte sim ou não para qualquer pessoa</p>
                    <button
                      onClick={handleNextTurn}
                      className="mt-4 w-full bg-white/20 hover:bg-white/30 text-white font-black py-3 rounded-2xl text-lg transition-all transform hover:scale-105 active:scale-95"
                    >
                      Já perguntei → Próximo ▶
                    </button>
                  </div>
                ) : (
                  <div className={`bg-gradient-to-r ${getColor(sorted.findIndex(p => p.id === currentTurnPlayer.id)).bg} rounded-3xl p-5 flex items-center gap-4 shadow-xl`}>
                    <div className="text-4xl">🎤</div>
                    <div className="flex-1">
                      <p className="text-white/70 text-sm font-semibold uppercase tracking-wider">Vez de perguntar</p>
                      <p className="text-white text-2xl font-black">{currentTurnPlayer.name}</p>
                    </div>
                    {(isHost) && (
                      <button
                        onClick={handleNextTurn}
                        className="bg-white/20 hover:bg-white/30 text-white font-bold px-4 py-2 rounded-xl text-sm transition-all"
                      >
                        Próximo ▶
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* YOUR mystery card */}
            {me && !me.is_eliminated && (
              <div className="mb-6">
                <p className="text-purple-300 text-sm uppercase tracking-widest font-semibold text-center mb-3">
                  Na sua testa 👆
                </p>
                <div className="bg-black/60 border-2 border-purple-500/50 rounded-3xl p-8 text-center glow-anim">
                  <div className="text-7xl font-black text-white mb-2 wiggle-anim inline-block">???</div>
                  <p className="text-purple-300 text-lg font-semibold">Você não pode ver!</p>
                </div>
                {isHost && (
                  <div className="flex justify-center mt-3">
                    <button
                      onClick={() => handleGuessed(me.id)}
                      className="bg-green-700/60 hover:bg-green-600/80 text-green-200 font-semibold px-5 py-2 rounded-xl text-sm border border-green-600/40 transition-all active:scale-95"
                    >
                      ✅ Acertei!
                    </button>
                  </div>
                )}
              </div>
            )}

            {me?.is_eliminated && (
              <div className="mb-6 bg-green-500/10 border-2 border-green-500/30 rounded-3xl p-6 text-center">
                <div className="text-5xl mb-2">🎊</div>
                <p className="text-green-400 text-xl font-black">Você adivinhou!</p>
                <p className="text-white/50 text-sm mt-1">Você era: <strong className="text-white">{me.character}</strong></p>
              </div>
            )}

            {/* Other players */}
            <p className="text-white/50 text-sm uppercase tracking-widest font-semibold mb-4">
              Os outros jogadores
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {sorted.filter(p => p.id !== myPlayerId).map((player) => {
                const colorIndex = players.findIndex(p => p.id === player.id)
                const color = getColor(colorIndex)
                const isTurn = player.id === currentTurnPlayer?.id
                return (
                  <div
                    key={player.id}
                    className={`relative rounded-3xl overflow-hidden transition-all ${player.is_eliminated ? 'opacity-40' : ''} ${isTurn ? 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-transparent' : ''}`}
                  >
                    <div className={`bg-gradient-to-br ${color.bg} p-5 shadow-xl ${color.shadow} shadow-lg`}>
                      {player.is_eliminated && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-3xl z-10">
                          <span className="text-5xl">✅</span>
                        </div>
                      )}
                      {isTurn && !player.is_eliminated && (
                        <div className="absolute top-3 right-3 text-xl">🎤</div>
                      )}
                      <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-3">
                        {player.name} é...
                      </p>
                      <p className="text-white font-black text-2xl leading-tight break-words">
                        {player.character || '???'}
                      </p>
                      {isHost && !player.is_eliminated && (
                        <button
                          onClick={() => handleGuessed(player.id)}
                          className="mt-3 bg-black/20 hover:bg-black/40 text-white/70 font-semibold px-4 py-1.5 rounded-lg text-xs border border-white/20 transition-all active:scale-95"
                        >
                          ✅ Acertou!
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

          </div>
        )}

        {/* ===== FINISHED ===== */}
        {room?.status === 'finished' && (
          <div className="mt-6 text-center">
            <div className="text-7xl mb-4 float-anim inline-block">🏆</div>
            <h2 className="text-white text-4xl font-black mb-2">Fim de jogo!</h2>
            <p className="text-purple-300 mb-8">Todo mundo adivinhou quem era!</p>

            <div className="space-y-3 mb-8 text-left">
              {sorted.map((player, i) => {
                const colorIndex = players.findIndex(p => p.id === player.id)
                const color = getColor(colorIndex)
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-4 bg-gradient-to-r ${color.bg} rounded-2xl p-4 shadow-lg ${color.shadow} pop-in`}
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    <Avatar name={player.name} colorIndex={colorIndex} />
                    <div className="flex-1">
                      <p className="text-white/70 text-sm">{player.name} era...</p>
                      <p className="text-white font-black text-xl">{player.character}</p>
                    </div>
                    <span className="text-2xl">✅</span>
                  </div>
                )
              })}
            </div>

            {isHost && (
              <button
                onClick={handleNewGame}
                className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-black py-5 rounded-2xl text-xl transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-purple-900/50 glow-anim"
              >
                🔄 Jogar Novamente
              </button>
            )}
            {!isHost && (
              <p className="text-white/40">Aguardando o anfitrião iniciar uma nova rodada...</p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
