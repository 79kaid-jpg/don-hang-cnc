-- Mỗi công ty tự lo XNĐH: duyệt xong không tự tạo phiếu cho công ty sau; công ty sau tự lập bằng tham chiếu mã đơn bên trước.
-- Thất bại ở IPC/HW chỉ thất bại phiếu của công ty đó (không đóng cả XNĐH); được lập lại từ cùng tham chiếu.

-- 1) doc_advance: bỏ tự tạo phiếu công ty sau → báo Zalo người Lập công ty sau; Thất bại chỉ đóng XNĐH khi là PN
do $$ declare d text; n int; begin
  d := pg_get_functiondef('public.doc_advance(uuid,text,text)'::regprocedure);
  d := regexp_replace(d, 'else\s+insert into docs\(batch_id, company, status, header, tables\).*?restricted_keys\(b\.proc\)\)\);\s*end if;',
    'else perform public._notify_ref_ready(d.id, nc); end if;', 's');
  if position('_notify_ref_ready' in d) = 0 then raise exception 'không tìm thấy đoạn tạo phiếu công ty sau'; end if;
  d := replace(d, $q$update batches set status = 'fail', done_at = now() where id = b.id;$q$,
    $q$if b.proc = 'QT0' or d.company = 'PN' then update batches set status = 'fail', done_at = now() where id = b.id; end if;$q$);
  execute d;
end $$;

-- 2) Báo người Lập của công ty sau: có thể lập XNĐH tham chiếu
create or replace function public._notify_ref_ready(p_doc uuid, p_co text) returns void language plpgsql security definer set search_path = public as $$
declare b batches; ids uuid[]; code text; nm text := case p_co when 'HW' then 'Hanwa' else p_co end;
begin
  select bb.* into b from docs dd join batches bb on bb.id = dd.batch_id where dd.id = p_doc;
  select array_agg(distinct u) into ids from (
    select cp.user_id u from chain_people cp where cp.proc = b.proc and cp.company = p_co and cp.role = 'lap' and cp.user_id is not null
    union select unnest(g.member_ids) from chain_people cp join work_groups g on g.id = cp.group_id and g.active where cp.proc = b.proc and cp.company = p_co and cp.role = 'lap') x;
  if ids is null then return; end if;
  code := doc_code(p_doc);
  perform _zsend(_with_deleg(ids), '📥 Đơn ' || code || ' đã duyệt' || E'\n' || nm || ': có thể lập XNĐH của mình bằng tham chiếu mã này.' || E'\n'
    || 'https://79kaid-jpg.github.io/don-hang-cnc/?z=1#/don/' || b.order_id || '?tab=' || b.proc);
end $$;

-- 3) Danh sách mã tham chiếu hợp lệ cho công ty p_co trong đơn p_order (đơn công ty trước đã duyệt, mình chưa lập hoặc đã thất bại)
create or replace function public.ref_candidates(p_order uuid, p_co text) returns table(code text, batch_id uuid, title text, used text) language sql stable security definer set search_path = public as $$
  select c.code, b.id, b.title, (select x.status from docs x where x.batch_id = b.id and x.company = p_co)
  from batches b join docs pd on pd.batch_id = b.id
    join co_orders c on c.batch_id = b.id and c.company = pd.company
  where b.order_id = p_order and b.proc = 'QT1' and b.status <> 'fail' and pd.status = 'da_duyet'
    and pd.company = case p_co when 'IPC' then 'PN' when 'HW' then 'IPC' end
    and not exists (select 1 from docs x where x.batch_id = b.id and x.company = p_co and x.status <> 'fail')
  order by b.created_at;
$$;

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
grant execute on function public.ref_candidates(uuid, text), public.doc_from_ref(text, text) to authenticated;
