-- Tách đơn (chọn tấm QT0 khi mở XNĐH) + QT2/QT3 gắn đơn PN. Đã áp dụng trên máy chủ qua MCP (migration "split_and_link").
alter table public.batches add column if not exists co_order_id uuid references public.co_orders(id) on delete set null;
-- batch_create: xem định nghĩa hiện hành trên máy chủ (p_opts.rows, p_opts.co_order)
create or replace function public.batch_create(p_order uuid, p_proc text, p_title text DEFAULT ''::text, p_opts jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare b uuid; n int; t jsonb := '{}'; ck jsonb := coalesce(p_opts->'checklist', '{}'); co uuid := nullif(p_opts->>'co_order', '')::uuid;
begin
  if not _is_person(p_proc, 'PN', case when p_proc = 'QT0' then 'admin' else 'lap' end) then raise exception 'Bạn không phụ trách lập hồ sơ % của Phương Nam CNC', p_proc; end if;
  if p_proc = 'QT2' and (select count(*) from jsonb_each_text(ck) where value = 'true') < 5 then
    raise exception 'Chưa đủ 5 điều kiện: bóc tách đã duyệt, đủ vật tư, đủ công cụ, vấn đề kỹ thuật đã xử lý, đã công bố tiêu chuẩn QC'; end if;
  if p_proc = 'QT1' and coalesce((p_opts->>'use_qt0')::boolean, false) then
    select d.tables into t from docs d join batches x on x.id = d.batch_id
      where x.order_id = p_order and x.proc = 'QT0' and x.status = 'hoan_tat' order by x.done_at desc limit 1;
    if t is null then raise exception 'Chưa có danh sách tấm QT0 đã duyệt để lấy'; end if;
    if jsonb_typeof(p_opts->'rows') = 'array' then
      if jsonb_array_length(p_opts->'rows') = 0 then raise exception 'Chưa chọn tấm nào'; end if;
      t := jsonb_build_object('ds', coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(coalesce(t->'ds', '[]')) with ordinality as x(e, i)
        where (i - 1)::text in (select jsonb_array_elements_text(p_opts->'rows'))), '[]'));
    else t := jsonb_build_object('ds', coalesce(t->'ds', '[]')); end if;
  end if;
  if co is not null and not exists (select 1 from co_orders where id = co and order_id = p_order and company = 'PN') then raise exception 'Đơn PN không thuộc hồ sơ này'; end if;
  select coalesce(max(seq), 0) + 1 into n from batches where order_id = p_order and proc = p_proc;
  insert into batches(order_id, proc, seq, title, checklist, co_order_id) values (p_order, p_proc, n,
    coalesce(nullif(trim(p_title), ''), case p_proc when 'QT0' then 'Bóc tách lần ' when 'QT1' then 'XNĐH ' when 'QT2' then 'Lệnh gia công ' else 'Đợt giao ' end || n), ck,
    case when p_proc in ('QT2','QT3') then co end)
    returning id into b;
  insert into docs(batch_id, company, status, tables) values (b, 'PN', (_flow(p_proc))[1], coalesce(t, '{}'));
  perform log_event(p_order, 'Mở ' || p_proc || ' · ' || (select title from batches where id = b));
  return b;
end $function$;
