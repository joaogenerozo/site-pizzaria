#!/bin/bash
# Testa o esquema num PostgreSQL local (não usa o Supabase de verdade).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
P="psql -v ON_ERROR_STOP=1 -q"
for t in 10_tests.sql 20_pricing.sql; do
  $P -c 'drop database if exists cardapio_test' -c 'create database cardapio_test' >/dev/null
  for f in "$DIR/00_supabase_stub.sql" "$DIR/../schema.sql" "$DIR/../storage.sql" "$DIR/../seed_demo.sql" "$DIR/$t"; do
    $P -d cardapio_test -f "$f" 2>&1 | grep -E 'OK|FALHOU|ERROR' || true
  done
done
