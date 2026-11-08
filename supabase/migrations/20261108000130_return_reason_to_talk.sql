-- Lý do trả về: chỉ hiện ở Trao đổi (tin 'turn' "Bị trả về – …"), không ghi vào Ghi chú nối tiếp (có thể in trên form)
do $$ declare s text; n text; begin
  s := pg_get_functiondef('public.doc_advance(uuid,text,text)'::regprocedure);
  n := regexp_replace(s, E',\\s*notes = notes \\|\\| jsonb_build_array\\(jsonb_build_object\\([^;]*?''Trả về[^;]*?\\)\\)\\s*\\n', E'\n', 'g');
  if n <> s then execute n; end if;
end $$;
-- dọn các dòng "Trả về: …" cũ trong Ghi chú
with x as (select id, (select coalesce(jsonb_agg(n order by i), '[]') from jsonb_array_elements(notes) with ordinality t(n, i) where coalesce(n->>'text', '') not like 'Trả về: %') nn
  from docs where notes::text like '%Trả về: %')
update docs d set notes = x.nn from x where d.id = x.id;
