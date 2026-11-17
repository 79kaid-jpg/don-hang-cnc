-- Chạy kịch bản TC02–TC10 trên DB tạm (CI) và kiểm kết quả. Lỗi → raise exception → CI đỏ, không deploy.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function ztest.expect(tc text, label text, ok boolean, got text) returns void language plpgsql as $$
begin
  insert into ztest.log(tc, step, res) values (tc, 'KIỂM: ' || label, case when ok then 'ĐẠT' else 'SAI · ' || got end);
end $$;

do $$ declare o uuid; a uuid; b uuid; q1 uuid; q2 uuid; tc text; r text; d uuid;
begin
  -- TC02: giao 3 đợt
  o := ztest.new_order('TC02'); a := ztest.qt0('TC02', o, 'TC02_1-BocTach'); q1 := ztest.qt1('TC02', o, a, null, 1000000);
  -- khoá thứ tự: QT2 IPC chưa được làm khi XNĐH IPC chưa duyệt
  perform ztest.qt2('TC02', o, q1, 'TC02_2-LGC');
  select d2.id into d from batches b2 join docs d2 on d2.batch_id = b2.id where b2.order_id = o and b2.proc = 'QT2' and d2.company = 'IPC';
  r := ztest.step(d); perform ztest.expect('TC02', 'IPC QT2 bị khoá khi XNĐH IPC chưa duyệt', r like '%Chờ XNĐH%', r);
  perform ztest.qt3('TC02', o, q1, 'TC02_3-BBGH_dot1-cua3'); perform ztest.qt3('TC02', o, q1, 'TC02_3-BBGH_dot2-cua3'); perform ztest.qt3('TC02', o, q1, 'TC02_3-BBGH_dot3-cua3');
  perform ztest.chain('TC02', o);
  -- TC03: 2 lần bóc tách
  o := ztest.new_order('TC03'); a := ztest.qt0('TC03', o, 'TC03_1-BocTach_lan1'); b := ztest.qt0('TC03', o, 'TC03_1-BocTach_lan2');
  q1 := ztest.qt1('TC03', o, a, null, 1000000); q2 := ztest.qt1('TC03', o, b, null, 1000000);
  perform ztest.qt2('TC03', o, q1, 'TC03_2-LGC_lan1'); perform ztest.qt2('TC03', o, q2, 'TC03_2-LGC_lan2');
  perform ztest.qt3('TC03', o, q1, 'TC03_3-BBGH_lan1'); perform ztest.qt3('TC03', o, q2, 'TC03_3-BBGH_lan2');
  perform ztest.chain('TC03', o);
  -- TC04: tách 2 XNĐH + chặn XNĐH thứ 3
  o := ztest.new_order('TC04'); a := ztest.qt0('TC04', o, 'TC04_1-BocTach');
  q1 := ztest.qt1('TC04', o, a, (select jsonb_agg(jsonb_build_object('i', i-1, 'q', _num(x->>'so_tam'))) from jsonb_array_elements(ztest.f('TC04_1-BocTach')) with ordinality z(x,i) where i <= 10), 1000000);
  q2 := ztest.qt1('TC04', o, a, (select jsonb_agg(jsonb_build_object('i', i-1, 'q', _num(x->>'so_tam'))) from jsonb_array_elements(ztest.f('TC04_1-BocTach')) with ordinality z(x,i) where i > 10), 1000000);
  perform ztest.expect('TC04', 'XNĐH thứ 3 bị chặn khi QT0 đã hết', ztest.qt1('TC04', o, a, '[{"i":0,"q":1}]', 1) is null, 'tạo được');
  perform ztest.qt2('TC04', o, q1, 'TC04_2-LGC_XNDH1'); perform ztest.qt2('TC04', o, q2, 'TC04_2-LGC_XNDH2');
  perform ztest.qt3('TC04', o, q1, 'TC04_3-BBGH_XNDH1'); perform ztest.qt3('TC04', o, q2, 'TC04_3-BBGH_XNDH2');
  perform ztest.chain('TC04', o);
  -- TC05–TC08, TC10: 1 bóc tách → 1 XNĐH → 1 LGC → 1 BBGH
  foreach tc in array array['TC05','TC06','TC07','TC08','TC10'] loop
    o := ztest.new_order(tc); a := ztest.qt0(tc, o, tc || '_1-BocTach'); q1 := ztest.qt1(tc, o, a, null, 1000000);
    perform ztest.qt2(tc, o, q1, tc || '_2-LGC');
    perform ztest.qt3(tc, o, q1, (select name from public.ztest_files where name like tc || '_3-BBGH%' limit 1));
    perform ztest.chain(tc, o);
  end loop;
end $$;

-- Kiểm số liệu Thống kê (xem như Admin IT)
select ztest.su((select id from profiles where 'admin_it' = any(roles) and active order by created_at limit 1));
do $$ declare s jsonb; tc text; co text; exp jsonb := '{"TC02":[100,100,0],"TC03":[89,89,0],"TC04":[83,83,0],"TC05":[498,498,0],"TC06":[80,80,0],"TC07":[29,19,10],"TC08":[39,39,0],"TC10":[60,60,0]}';
  e jsonb; x jsonb;
begin
  for tc, e in select * from jsonb_each(exp) loop
    s := ztest.stat(tc);
    foreach co in array array['PN','IPC','HW'] loop
      perform ztest.expect(tc, co || ' đặt/giao/còn = ' || e::text,
        (s->co->>'dat_tam')::numeric = (e->>0)::numeric and (s->co->>'giao_tam')::numeric = (e->>1)::numeric and (s->co->>'con_tam')::numeric = (e->>2)::numeric,
        coalesce(s->co, 'null')::text);
    end loop;
  end loop;
  -- mã lạ / giao dư được tách riêng
  select jsonb_agg(q->'x') into x from jsonb_array_elements(public.prod_stats('PN')->'q3') q join orders o on o.id = (q->>'order_id')::uuid where o.description = 'auto TC07';
  perform ztest.expect('TC07', 'PN: 10 tấm mã lạ tách riêng', (x->0->>0)::numeric = 10, coalesce(x::text, 'null'));
  select jsonb_agg(q->'x') into x from jsonb_array_elements(public.prod_stats('PN')->'q3') q join orders o on o.id = (q->>'order_id')::uuid where o.description = 'auto TC08';
  perform ztest.expect('TC08', 'PN: 10 tấm giao dư tách riêng', (x->0->>1)::numeric = 10, coalesce(x::text, 'null'));
end $$;

-- Lỗi quy trình (ERR / NO_HOLDER) trong log cũng tính là SAI
insert into ztest.log(tc, step, res) select tc, 'KIỂM: không có bước lỗi', 'SAI · ' || string_agg(step || ' ' || res, ' | ')
  from ztest.log where (res like '%ERR%' or res like '%NO_HOLDER%') and step not like 'KIỂM%' and step not in ('QT1 tạo') group by tc;

\echo '================ KẾT QUẢ ================'
select tc, step, res from ztest.log where step like 'KIỂM%' order by id;
do $$ declare n int; begin select count(*) into n from ztest.log where step like 'KIỂM%' and res like 'SAI%';
  if n > 0 then raise exception '% kiểm tra SAI – xem bảng trên', n; end if; end $$;
\echo 'TẤT CẢ ĐẠT'
