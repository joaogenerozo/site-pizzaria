-- =====================================================================
-- STORAGE — bucket público de imagens do cardápio
-- =====================================================================
-- Execute depois do schema.sql. Leitura pública das imagens; envio,
-- troca e exclusão somente por administradores.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy menu_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-images' and (select public.is_admin()));

create policy menu_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'menu-images' and (select public.is_admin()))
  with check (bucket_id = 'menu-images' and (select public.is_admin()));

create policy menu_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-images' and (select public.is_admin()));
