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

  // Substitui o personagem do próprio jogador por um marcador:
  // - null → continua null (não foi atribuído ainda)
  // - valor real → '__HIDDEN__' (foi atribuído, mas o conteúdo não vaza pro browser)
  const filtered = players.map(p =>
    p.id === playerId && p.character !== null
      ? { ...p, character: '__HIDDEN__' }
      : p
  )

  return NextResponse.json(filtered)
}
