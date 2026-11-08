-- Khi chuyển phiếu sang công ty kế tiếp: bỏ mọi trường nhạy cảm (giá của bên bán) khỏi bản chép
create or replace function public.restricted_keys(p_proc text) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(case when area = 'header' then 'h:' || key else tbl || ':' || key end), '{}') || case when p_proc = 'QT1' then array['h:tong_tt'] else '{}'::text[] end
  from proc_fields where proc = p_proc and restricted and active;
$$;
do $$ declare s text; n text; begin
  s := pg_get_functiondef('public.doc_advance(uuid,text,text)'::regprocedure);
  n := replace(s, $x$values (b.id, nc, 'lap', d.header - 'so_lenh' - 'so_hd' - 'so_phieu' - 'so_xn',
            case when b.proc = 'QT1' then jsonb_build_object('ds', coalesce((select jsonb_agg(x - 'don_gia') from jsonb_array_elements(d.tables->'ds') x), '[]'))
                 else d.tables end);$x$,
  $x$values (b.id, nc, 'lap', _mask_h(d.header - 'so_lenh' - 'so_hd' - 'so_phieu' - 'so_xn', restricted_keys(b.proc)),
            _mask_t(case when b.proc = 'QT1' then jsonb_build_object('ds', coalesce((select jsonb_agg(x - 'don_gia') from jsonb_array_elements(d.tables->'ds') x), '[]'))
                 else d.tables end, restricted_keys(b.proc)));$x$);
  if n <> s then execute n; end if;
end $$;
