-- Mã nội bộ đơn: {mã khách cuối}-{YYMM}-{STT:2}, đếm theo khách + tháng (VD BM-2611-01)
create or replace function set_order_code() returns trigger language plpgsql security definer set search_path=public as $$
declare p text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM'); n int; kh text; s text;
begin
  if new.code is null then
    select upper(regexp_replace(cu.code, '[^A-Za-z0-9]', '', 'g')) into kh from customers cu
      where cu.id = coalesce((select end_customer_id from projects where id = new.project_id), new.customer_id);
    kh := coalesce(nullif(kh, ''), 'KH');
    insert into co_counters2(k, last) values ('ORD|' || kh || '|' || p, 1)
      on conflict (k) do update set last = co_counters2.last + 1 returning last into n;
    s := kh || '-' || p || '-' || lpad(n::text, 2, '0');
    while exists (select 1 from orders where code = s) loop n := n + 1; s := kh || '-' || p || '-' || lpad(n::text, 2, '0'); end loop;
    new.code := s;
  end if;
  return new;
end $$;
