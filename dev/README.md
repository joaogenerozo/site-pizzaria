# Ambiente local de testes (imita o Supabase)

Serve para testar o site sem conta no Supabase. Nada aqui vai para produção.

- PostgreSQL 16 local com `supabase/tests/00_supabase_stub.sql` (papéis anon/authenticated e `auth.uid()`).
- PostgREST 12 em `localhost:54330` (API REST igual à do Supabase; o Vite redireciona `/rest/v1`).
- `make-jwt.mjs` gera as chaves locais (assinadas com um segredo de teste, só local).

```bash
bash dev/reset-db.sh                 # recria o banco "dev" com o esquema + dados de demonstração
postgrest dev/postgrest.conf &       # sobe a API local
npm run dev                          # http://localhost:5173
```
