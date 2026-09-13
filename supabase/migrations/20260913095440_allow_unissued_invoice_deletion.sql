-- Existing ALL policy already limits access to active administrators in the
-- document's company. A restrictive DELETE policy must accompany the grant:
-- another permissive policy must never make issued documents deletable.
create policy project_documents_delete_unissued_only
on public.project_documents as restrictive for delete to authenticated
using (
  kind in ('invoice','progress') and status in ('draft','void')
  and issued_at is null and document_number is null
  and number_year is null and number_seq is null
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.company_id=project_documents.company_id
      and p.active and p.role='admin'
  )
);
grant delete on public.project_documents to authenticated;

create function public.toya_delete_unissued_invoice(p_id uuid,p_expected_updated_at timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c uuid; r public.project_documents; deleted_id uuid;
begin
  select company_id into c from public.profiles
    where id=auth.uid() and active and role='admin';
  if c is null then raise exception '管理者のログインが必要です。'; end if;
  perform pg_advisory_xact_lock(hashtextextended(c::text,0));
  select * into r from public.project_documents where id=p_id and company_id=c for update;
  if not found then raise exception '書類を確認できません。一覧を更新してください。'; end if;
  if r.updated_at is distinct from p_expected_updated_at then
    raise exception '書類が更新されています。開き直してから削除してください。';
  end if;
  if r.kind not in ('invoice','progress') or r.status not in ('draft','void')
    or r.issued_at is not null or r.document_number is not null
    or r.number_year is not null or r.number_seq is not null then
    raise exception '完全削除できるのは、一度も確定していない請求書です。';
  end if;
  delete from public.project_documents where id=r.id and company_id=c returning id into deleted_id;
  if deleted_id is null then raise exception '削除できませんでした。一覧を更新してください。'; end if;
  return deleted_id;
end $$;
revoke all on function public.toya_delete_unissued_invoice(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.toya_delete_unissued_invoice(uuid,timestamptz) to authenticated;
comment on function public.toya_delete_unissued_invoice(uuid,timestamptz)
  is 'Permanently delete one never-issued invoice/progress draft, with company-admin RLS and optimistic version check.';
