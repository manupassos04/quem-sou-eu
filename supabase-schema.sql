-- =========================================
-- Quem Sou Eu? - Schema do Supabase
-- Cole este SQL no SQL Editor do Supabase
-- =========================================

-- Tabela de salas
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'assigning', 'playing', 'finished')),
  host_player_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de jogadores
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seat_order INTEGER,
  character TEXT,
  is_eliminated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Segurança permissiva (jogo público)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acesso_publico_rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "acesso_publico_players" ON players FOR ALL USING (true) WITH CHECK (true);

-- Ativar Realtime para as tabelas
-- (Você também pode ativar pelo painel: Realtime → Tables)
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
