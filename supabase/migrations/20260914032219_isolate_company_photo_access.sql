-- Existing files already use company_id/report_id/file paths. Do not move or delete files.
drop policy if exists "toya_photos_read_write 1rpznij_0" on storage.objects;
drop policy if exists "toya_photos_read_write 1rpznij_1" on storage.objects;

-- A restrictive boundary also protects against a future permissive policy being added.
create policy toya_photos_tenant_boundary
on storage.objects as restrictive for all to authenticated
using (
  bucket_id <> 'toya-photos'
  or (storage.foldername(name))[1] = (select public.toya_current_company_id())::text
)
with check (
  bucket_id <> 'toya-photos'
  or (storage.foldername(name))[1] = (select public.toya_current_company_id())::text
);
