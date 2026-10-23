-- Simula o mínimo do Supabase para testes locais
do $$ begin if not exists (select from pg_roles where rolname=$r$anon$r$) then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema auth; grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
$$ select coalesce(
     nullif(current_setting('request.jwt.claim.sub', true), ''),
     nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase concede privilégios padrão amplos; reproduzimos para provar que o schema os revoga
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create schema storage; grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated;
-- Papel de login usado pelo PostgREST no ambiente de desenvolvimento local
do $$ begin if not exists (select from pg_roles where rolname='authenticator') then
  create role authenticator login noinherit; end if; end $$;
grant anon, authenticated to authenticator;
