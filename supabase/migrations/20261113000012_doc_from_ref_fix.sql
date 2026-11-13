-- Sửa lỗi "column reference id is ambiguous" trong doc_from_ref
-- 4) Lập XNĐH từ tham chiếu: copy danh sách tấm (không giá), điều kiện giao hàng; ngày lập = hôm nay
create or replace function public.doc_from_ref(p_code text, p_co text) returns uuid language plpgsql security definer set search_path = public as $$
declare c co_orders; pd docs; b batches; ex docs; v_id uuid; prev text := case p_co when 'IPC' then 'PN' when 'HW' then 'IPC' end;
  hd jsonb; tb jsonb;
begin
  if prev is null then raise exception 'Công ty % không lập từ tham chiếu', p_co; end if;
  if not (has_role('admin_it') or has_role('admin_cnc') or _is_person('QT1', p_co, 'lap')) then raise exception 'Bạn không phải người Lập XNĐH của %', p_co; end if;
  select co.* into c from co_orders co where upper(trim(code)) = upper(trim(p_code)) and company = prev order by created_at desc limit 1;
  if c.id is null then raise exception 'Không tìm thấy mã đơn % của %', p_code, prev; end if;
  select bb.* into b from batches bb where bb.id = c.batch_id;
  select x.* into pd from docs x where x.batch_id = b.id and x.company = prev;
  if b.status = 'fail' or pd.status = 'fail' then raise exception 'Đơn % đã Thất bại, không dùng làm tham chiếu được.', p_code; end if;
  if pd.status <> 'da_duyet' then raise exception 'Đơn % chưa duyệt xong, chưa tham chiếu được.', p_code; end if;
  select x.* into ex from docs x where x.batch_id = b.id and x.company = p_co;
  if ex.id is not null and ex.status <> 'fail' then raise exception '% đã lập XNĐH từ đơn này rồi.', p_co; end if;
  hd := jsonb_strip_nulls(jsonb_build_object('dk_giao', pd.header->'dk_giao', 'ngay', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'), 'ref', p_code));
  tb := _mask_t(jsonb_build_object('ds', coalesce((select jsonb_agg(x - 'don_gia' - 'tt') from jsonb_array_elements(pd.tables->'ds') x), '[]')), restricted_keys('QT1'));
  if ex.id is not null then
    update docs set status = 'lap', status_at = now(), header = hd, tables = tb, checklist = '{}'::jsonb, apv = null, assignee = null where docs.id = ex.id returning docs.id into v_id;
  else
    insert into docs(batch_id, company, status, header, tables) values (b.id, p_co, 'lap', hd, tb) returning docs.id into v_id;
  end if;
  perform log_event(b.order_id, 'QT1 · ' || b.title || ' · ' || p_co || ': lập XNĐH tham chiếu ' || p_code);
  return b.id;
end $$;
