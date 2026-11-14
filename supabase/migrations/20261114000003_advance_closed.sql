-- Phiếu đã duyệt / thất bại: không chuyển bước, trả về, đánh thất bại nữa (kể cả admin)
do $$ declare d text; begin
  d := pg_get_functiondef('public.doc_advance(uuid,text,text)'::regprocedure);
  d := replace(d, $q$select * into d from docs where id = p_doc for update; select * into b from batches where id = d.batch_id;$q$,
    $q$select * into d from docs where id = p_doc for update; select * into b from batches where id = d.batch_id;
  if d.status in ('da_duyet', 'fail') or b.status in ('hoan_tat', 'fail') then raise exception 'Phiếu đã chốt (%), không thao tác được nữa', case when d.status = 'fail' or b.status = 'fail' then 'thất bại' else 'đã duyệt' end; end if;$q$);
  if position('Phiếu đã chốt' in d) = 0 then raise exception 'không sửa được doc_advance'; end if;
  execute d;
end $$;
