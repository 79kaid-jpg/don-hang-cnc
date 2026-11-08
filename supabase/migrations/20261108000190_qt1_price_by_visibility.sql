-- Đơn giá QT1: bắt buộc ở bước của người THẤY giá (Lập nếu được cấp quyền xem giá, nếu không thì Duyệt);
-- người duyệt nhập / sửa được Đơn giá ở bước Duyệt. (Phát hiện khi chạy thử toàn bộ đơn 08/11/2026)
do $$ declare s text; n text; begin
  s := pg_get_functiondef('public.doc_advance(uuid,text,text)'::regprocedure);
  n := replace(s, $x$      if exists (select 1 from jsonb_array_elements(d.tables->'ds') x where coalesce((x->>'don_gia')::numeric, 0) <= 0) then raise exception 'Còn dòng chưa có đơn giá'; end if;
    end if;$x$, $x$    end if;
    if b.proc = 'QT1' and d.status in ('lap', 'duyet') and not ('ds:don_gia' = any(hidden_keys('QT1', d.company)))
       and exists (select 1 from jsonb_array_elements(d.tables->'ds') x where coalesce(nullif(x->>'don_gia', '')::numeric, 0) <= 0)
      then raise exception 'Còn dòng chưa có đơn giá'; end if;$x$);
  if n <> s then execute n; end if;
end $$;
update public.proc_fields set perms = jsonb_set(jsonb_set(jsonb_set(perms, '{PN,duyet}', '"edit"'), '{IPC,duyet}', '"edit"'), '{HW,duyet}', '"edit"')
 where proc = 'QT1' and area = 'col' and tbl = 'ds' and key = 'don_gia';
