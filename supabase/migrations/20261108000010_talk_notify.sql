-- Trao đổi: mọi tin (app hoặc Zalo) đều báo Zalo cho người bên kia
create or replace function public._reply(p_uid uuid, p_doc uuid, p_text text, p_via text) returns uuid language plpgsql security definer set search_path = public as $$
declare n order_msgs; oid uuid; nm text; rid uuid; hs uuid[]; rc uuid[]; lastfrom uuid;
begin
  select * into n from order_msgs where doc_id = p_doc and kind in ('nudge','reassign') and replied_at is null and p_uid = any(_with_deleg(to_users)) order by at desc limit 1;
  select b.order_id into oid from docs d join batches b on b.id = d.batch_id where d.id = p_doc;
  hs := doc_holders(p_doc);
  if n.id is not null then rc := array[n.from_user];
  elsif p_uid = any(_with_deleg(hs)) then
    select from_user into lastfrom from order_msgs where doc_id = p_doc and kind in ('nudge','reassign','reply') and from_user is not null and from_user <> p_uid order by at desc limit 1;
    rc := case when lastfrom is not null then array[lastfrom] else (select coalesce(array_agg(manager_id), '{}') from profiles where id = p_uid and manager_id is not null) end;
  else rc := hs;
  end if;
  rc := array(select x from unnest(rc) x where x is not null and x <> p_uid);
  insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text, via, meta)
    values (oid, p_doc, 'reply', p_uid, rc, trim(p_text), p_via,
      case when n.id is null then '{}'::jsonb else jsonb_build_object('nudge', n.id) end) returning id into rid;
  if n.id is not null then update order_msgs set replied_at = now() where id = n.id; end if;
  if cardinality(rc) > 0 then
    select full_name into nm from profiles where id = p_uid;
    perform _zsend(case when rc = hs then _with_deleg(rc) else rc end, '💬 ' || coalesce(nm, '') || ':' || E'\n“' || trim(p_text) || E'”\n' || _doc_line(p_doc)
      || E'\n\nTrả lời: gõ số đơn + nội dung, VD: "' || _short_code(p_doc) || ' ok"');
  end if;
  return rid;
end $$;

create or replace function public.zalo_reply(p_chat text, p_text text) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid; n order_msgs; c text; num text; t text := trim(coalesce(p_text, ''));
begin
  select id into uid from profiles where zalo_chat_id = p_chat and active limit 1;
  if uid is null or t = '' then return null; end if;
  num := substring(t from '^#?(?:ĐH-\d{6}-)?(\d{1,4})\y');
  if num is not null then
    select m.* into n from order_msgs m join orders o on o.id = m.order_id
      where m.at > now() - interval '7 days' and (uid = any(_with_deleg(m.to_users)) or m.from_user = uid) and m.doc_id is not null
        and o.code ~ ('-0*' || num || '$') order by (m.kind in ('nudge','reassign') and m.replied_at is null) desc, m.at desc limit 1;
    if n.id is not null then t := trim(regexp_replace(t, '^#?(?:ĐH-\d{6}-)?\d{1,4}\s*[:.,-]?\s*', '')); end if;
  end if;
  if n.id is null then
    select * into n from order_msgs where at > now() - interval '48 hours' and uid = any(_with_deleg(to_users)) and doc_id is not null
      order by (kind in ('nudge','reassign') and replied_at is null) desc, at desc limit 1;
  end if;
  if n.id is null then return null; end if;
  if t = '' then t := p_text; end if;
  perform _reply(uid, n.doc_id, t, 'zalo');
  select o.code into c from orders o where o.id = n.order_id;
  return '✓ Đã ghi vào đơn ' || c || ' và báo người liên quan.';
end $$;
