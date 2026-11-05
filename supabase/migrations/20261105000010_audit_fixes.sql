-- (applied via MCP) Kiểm tra hệ thống 05/11
-- 1) Khoá quyền anon gọi các hàm SECURITY DEFINER
do $$ declare r record; begin
for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef loop
  execute format('revoke execute on function %s from anon, public', r.f); execute format('grant execute on function %s to authenticated', r.f); end loop;
alter default privileges in schema public revoke execute on functions from anon, public; end $$;
-- 2) Báo Zalo cả khi chuyển cấp duyệt thêm (apv đổi, status giữ nguyên duyet_them)
create or replace function public.docs_zalo() returns trigger language plpgsql security definer set search_path to 'public','extensions' as $f$
declare k text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.apv is not distinct from old.apv then return new; end if;
  select value into k from app_secrets where name = 'NOTIFY_KEY';
  if k is null then return new; end if;
  perform net.http_post(url := 'https://wtybzzlglgvzflovqhng.supabase.co/functions/v1/zalo?op=doc',
    body := jsonb_build_object('doc_id', new.id), headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-key', k));
  return new;
end $f$;
