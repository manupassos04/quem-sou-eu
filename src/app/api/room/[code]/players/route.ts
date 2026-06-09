import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Rota server-side: filtra o personagem do próprio jogador antes de enviar ao browser.
// Assim o character nunca aparece no DevTools de quem não deveria ver.
export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const playerId = req.nextUrl.searchParams.get('playerId') ?? ''

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  )

  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('code', params.code)
    .single()

  if (!room) return NextResponse.json([])

  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', room.id)
    .order('created_at')

  if (!players) return NextResponse.json([])

  // Oculta o personagem do próprio jogador enquanto ele ainda está jogando.
  // Após acertar (is_eliminated = true), revela o personagem pra mostrar "você era X".
  const filtered = players.map(p =>
    p.id === playerId && p.character !== null && !p.is_eliminated
      ? { ...p, character: '__HIDDEN__' }
      : p
  )

  return NextResponse.json(filtered)
}
