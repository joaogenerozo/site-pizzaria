#!/bin/bash
# Recria o banco local "dev". Variáveis PGHOST/PGPORT/PGUSER apontam para o Postgres local.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PGHOST=${PGHOST:-/home/claude/.pgtest} PGPORT=${PGPORT:-54329} PGUSER=${PGUSER:-postgres}
psql -q -c 'drop database if exists dev with (force)' -c 'create database dev'
for f in supabase/tests/00_supabase_stub.sql supabase/schema.sql supabase/storage.sql supabase/seed_demo.sql; do
  psql -q -v ON_ERROR_STOP=1 -d dev -f "$DIR/$f"
done
# Número FICTÍCIO só para o teste local abrir o link; nunca vai para produção.
psql -q -d dev -c "update store_settings set whatsapp_number = '5511900000000'"
# Usuários do login falso (dev/mock-auth.mjs): um admin e um cliente comum
psql -q -d dev -c "insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','admin@teste.local'),
  ('22222222-2222-2222-2222-222222222222','cliente@teste.local');
  insert into public.admins (user_id) values ('11111111-1111-1111-1111-111111111111');"
psql -q -d dev -c "notify pgrst, 'reload schema'"
echo "banco dev recriado"
# Se o PostgREST local estiver rodando, espera ele reconectar ao banco recriado
if curl -s -o /dev/null http://localhost:54330/ 2>/dev/null || [ $? -ne 7 ]; then
  for i in $(seq 1 50); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:54330/categories?limit=1)" = "200" ] && break
    sleep 0.2
  done
fi
