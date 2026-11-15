-- Sửa lỗi "column reference k is ambiguous"
create or replace function _co_make_code(p_co text, p_order uuid) returns text language plpgsql security definer set search_path=public as $$
declare c companies; d date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; n int; mua text; da text; s text; w int; per text; kk text;
begin
  select * into c from companies where code = p_co; if not found then return null; end if;
  if c.buyer is not null then mua := c.buyer;
  else select coalesce(nullif(cu.code, ''), 'KH') into mua from orders o left join projects p on p.id = o.project_id left join customers cu on cu.id = coalesce(p.end_customer_id, o.customer_id) where o.id = p_order; end if;
  select p.code into da from orders o left join projects p on p.id = o.project_id where o.id = p_order;
  per := case when c.rule ~ '\{(YYYYMMDD|YYMMDD)\}' then to_char(d,'YYYYMMDD') when c.rule ~ '\{YYMM\}' then to_char(d,'YYYYMM') else 'all' end;
  kk := p_co || '|' || per || case when c.rule like '%{DA}%' then '|' || coalesce(da,'DA') else '' end;
  insert into co_counters2(k, last) values (kk, 1) on conflict (k) do update set last = co_counters2.last + 1 returning last into n;
  s := c.rule;
  s := replace(s, '{YYYYMMDD}', to_char(d, 'YYYYMMDD')); s := replace(s, '{YYMMDD}', to_char(d, 'YYMMDD')); s := replace(s, '{YYMM}', to_char(d, 'YYMM'));
  s := replace(s, '{BAN}', p_co); s := replace(s, '{B1}', _co_b1(p_co)); s := replace(s, '{MUA}', coalesce(mua, 'KH')); s := replace(s, '{DA}', coalesce(da, 'DA'));
  w := coalesce((regexp_match(s, '\{STT:(\d)\}'))[1]::int, 2);
  s := regexp_replace(s, '\{STT(:\d)?\}', lpad(n::text, w, '0'));
  while exists (select 1 from co_orders where code = s) loop s := s || '-' || n; end loop;
  return s;
end $$;
