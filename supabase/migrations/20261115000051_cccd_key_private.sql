-- Khoá mã hoá CCCD chuyển sang private.kv (không nằm trong app_secrets mà màn Kết nối quản lý → không bị xoá nhầm)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.kv (k text primary key, v text not null, at timestamptz default now());
insert into private.kv(k, v) select 'CCCD_KEY', encode(extensions.gen_random_bytes(32), 'hex') where not exists (select 1 from private.kv where k = 'CCCD_KEY');
create or replace function public._cccd_key() returns text language plpgsql stable security definer set search_path = public as $$
declare r text; begin select x.v into r from private.kv x where x.k = 'CCCD_KEY'; if r is null then raise exception 'Thiếu khoá mã hoá CCCD – báo Admin IT'; end if; return r; end $$;
revoke all on function public._cccd_key() from public, anon, authenticated;
-- _docs_cccd và reveal_cccd dùng _cccd_key() (xem bản áp qua MCP 17/11)
