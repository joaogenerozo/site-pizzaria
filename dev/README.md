# Ambiente local de testes (imita o Supabase)

Serve para testar o site sem conta no Supabase. Nada aqui vai para produção.

- PostgreSQL 16 local com `supabase/tests/00_supabase_stub.sql` (papéis anon/authenticated e `auth.uid()`).
- PostgREST 12 em `localhost:54330` (API REST igual à do Supabase; o Vite redireciona `/rest/v1`).
- `mock-auth.mjs`: login falso em `localhost:54331` (admin@teste.local / senha-admin-local).
- `make-jwt.mjs` gera as chaves locais (assinadas com um segredo de teste, só local).

Por padrão os scripts usam o Postgres em `localhost:5432` com o usuário `postgres`.
Se o seu for diferente, defina `PGHOST`, `PGPORT`, `PGUSER` e `PGPASSWORD` antes dos comandos
e ajuste a linha `db-uri` de `postgrest.conf`.

```bash
bash dev/reset-db.sh                 # recria o banco "dev" com o esquema + dados de demonstração
SEED=domingos bash dev/reset-db.sh   # ...ou com o cardápio real da Domingo's
postgrest dev/postgrest.conf &       # sobe a API local
node dev/mock-auth.mjs &             # sobe o login falso
npm run dev                          # http://localhost:5173
npm run test:e2e                     # testes no navegador (Playwright)
bash supabase/tests/run.sh           # testes do banco
```
