-- Sang công ty sau: không chép VAT, Điều kiện thanh toán, Ngày lập (ngày lập = hôm nay). Giữ Điều kiện giao hàng.
do $$ declare d text; begin
  d := pg_get_functiondef('public.doc_advance(uuid,text,text)'::regprocedure);
  d := replace(d, $q$d.header - 'so_lenh' - 'so_hd' - 'so_phieu' - 'so_xn'$q$,
    $q$(d.header - 'so_lenh' - 'so_hd' - 'so_phieu' - 'so_xn' - 'vat' - 'dk_tt' - 'ngay') || jsonb_build_object('ngay', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'))$q$);
  if position($q$- 'dk_tt'$q$ in d) = 0 then raise exception 'không tìm thấy chỗ chép đầu phiếu trong doc_advance'; end if;
  execute d;
end $$;
