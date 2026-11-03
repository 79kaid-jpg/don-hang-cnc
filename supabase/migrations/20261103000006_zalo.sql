-- Thông báo Zalo: liên kết tài khoản Zalo với người dùng, gửi tin khi đến lượt duyệt / bị từ chối
create extension if not exists pg_net with schema extensions;

-- Bí mật dùng nội bộ (token bot, khoá gọi hàm). RLS bật, không policy → chỉ service_role đọc được.
create table public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

alter table public.profiles add column if not exists zalo_chat_id text;
alter table public.profiles add column if not exists zalo_name text;

create table public.zalo_link_codes (
  code text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 minutes'
);
alter table public.zalo_link_codes enable row level security;
revoke all on public.zalo_link_codes from anon, authenticated;

-- Người dùng lấy mã liên kết (6 số)
create or replace function public.zalo_link_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  c := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into zalo_link_codes(code, user_id) values (c, app_uid())
    on conflict (code) do update set user_id = excluded.user_id, expires_at = now() + interval '30 minutes';
  return c;
end $$;
create or replace function public.zalo_unlink() returns void
language sql security definer set search_path = public as $$ update profiles set zalo_chat_id = null, zalo_name = null where id = app_uid() $$;
revoke execute on function public.zalo_link_code(), public.zalo_unlink() from public, anon;
grant execute on function public.zalo_link_code(), public.zalo_unlink() to authenticated;

-- Gọi Edge Function "zalo" khi có lượt duyệt mới / bị từ chối
create or replace function public.zalo_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  select value into k from app_secrets where name = 'NOTIFY_KEY';
  if k is null then return new; end if;
  if (tg_op = 'INSERT' and new.status = 'cho') or (tg_op = 'UPDATE' and new.status = 'tu_choi' and old.status = 'cho') then
    perform net.http_post(
      url := 'https://wtybzzlglgvzflovqhng.supabase.co/functions/v1/zalo?op=approval',
      body := jsonb_build_object('approval_id', new.id, 'event', case when tg_op = 'INSERT' then 'cho' else 'tu_choi' end),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-key', k));
  end if;
  return new;
end $$;
create trigger approvals_zalo after insert or update on public.approvals for each row execute function public.zalo_notify();
revoke execute on function public.zalo_notify() from public, anon, authenticated;
