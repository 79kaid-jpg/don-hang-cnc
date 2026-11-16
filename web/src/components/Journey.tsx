import { RtThumbs, rtFilesAt } from './RtThumbs';
import { cached, peek } from '../lib/qcache';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useAuth } from '../lib/auth';
import { sb, errText, type Profile } from '../lib/supabase';
import { toast } from './ui';
import { dt } from '../lib/format';
import { COMPANY, FLOW, ROLE_NAME, ROLE_OF, STATUS, type Doc, type Proc } from '../lib/proc';
import { Icon } from './Icon';

type CP = { role: string; user_id: string | null; group_id: string | null; sla_h: number | null };
type LV = { id: string; name: string; user_id: string | null; group_id: string | null; sla_h: number };
type Sign = { role: string; user: string; at: string; action: string; note?: string; level?: string; by?: string };
type St = { key: string; label: string; who: string; sla: number; state: 'done' | 'now' | 'todo'; sign?: Sign; extra?: boolean };

const short = (n: string) => n.split(' ').slice(-2).join(' ');
const ini = (n: string) => { const w = n.replace(/\(.*?\)|→.*$/g, '').trim().split(/\s+/).filter(Boolean); const x = [...w].reverse().find((t) => /^\p{L}/u.test(t)) ?? w[0]; return (x?.[0] ?? '?').toUpperCase(); };
const fmtLeft = (h: number) => (Math.abs(h) >= 24 ? Math.round(Math.abs(h) / 24) + ' ngày' : Math.max(1, Math.round(Math.abs(h))) + 'h');

/** Hành trình duyệt: stepper + timeline (bấm để mở) */
export function Journey({ d, proc, people }: { d: Doc & { apv?: { queue: string[]; idx: number }; assignee?: string | null; assign_note?: string | null }; proc: Proc; people: Record<string, Profile> }) {
  const company0 = proc === 'QT0' ? 'PN' : d.company;
  const [cp, setCp] = useState<CP[]>(() => (peek<{ data: CP[] | null }>('cp:' + proc + ':' + company0)?.data) ?? []);
  const [lvs, setLvs] = useState<LV[]>(() => (d.apv?.queue?.length ? [] : peek<{ data: LV[] | null }>('lv:' + proc + ':' + company0)?.data) ?? []);
  const [gs, setGs] = useState<Record<string, string>>(() => Object.fromEntries((peek<{ data: { id: string; name: string }[] | null }>('wg')?.data ?? []).map((g) => [g.id, g.name])));
  const [dl, setDl] = useState<{ user_id: string; to_user: string }[]>([]); const [open, setOpen] = useState(false); const [pk, setPk] = useState('');
  const company = proc === 'QT0' ? 'PN' : d.company;
  useEffect(() => {
    cached('cp:' + proc + ':' + company, () => sb.from('chain_people').select('role, user_id, group_id, sla_h').eq('proc', proc).eq('company', company)).then(({ data }) => setCp((data as CP[]) ?? []));
    const qk = d.apv?.queue?.length ? 'lvq:' + d.apv.queue.join() : 'lv:' + proc + ':' + company;
    cached(qk, () => { const q = sb.from('approval_levels').select('id, name, user_id, group_id, sla_h, ord');
      return (d.apv?.queue?.length ? q.in('id', d.apv.queue) : q.eq('proc', proc).eq('company', company).eq('active', true)).order('ord'); })
      .then(({ data }) => { const l = (data as LV[]) ?? []; setLvs(d.apv?.queue?.length ? d.apv.queue.map((id) => l.find((x) => x.id === id)!).filter(Boolean) : l); });
    cached('wg', () => sb.from('work_groups').select('id, name, member_ids')).then(({ data }) => setGs(Object.fromEntries(((data as { id: string; name: string }[]) ?? []).map((g) => [g.id, g.name]))));
    const today = new Date().toISOString().slice(0, 10);
    cached('dl:' + today, () => sb.from('delegations').select('user_id, to_user, from_date, to_date').lte('from_date', today).gte('to_date', today)).then(({ data }) => setDl((data as { user_id: string; to_user: string }[]) ?? []));
  }, [d.id, d.status, proc, company]); // eslint-disable-line react-hooks/exhaustive-deps

  const nm = (u: string | null, g: string | null) => {
    if (u) { const del = dl.find((x) => x.user_id === u); const base = people[u]?.full_name ?? '…'; return del ? short(base) + ' → ' + short(people[del.to_user]?.full_name ?? '…') : short(base); }
    return g ? gs[g] ?? 'Nhóm' : 'Chưa gán';
  };
  const signs = [...((d.signs ?? []) as Sign[])].sort((a, z) => a.at.localeCompare(z.at));
  const flow = FLOW[proc]; const done = d.status === 'da_duyet';
  const curMain = d.status === 'duyet_them' || done ? flow.length : flow.indexOf(d.status);
  const steps: St[] = flow.map((s, i) => {
    const r = ROLE_OF[s]; const c = cp.find((x) => x.role === r);
    return { key: s, label: s === 'tiep_nhan' ? 'Tiếp nhận' : STATUS[s], who: nm(c?.user_id ?? null, c?.group_id ?? null), sla: c?.sla_h ?? 48,
      state: i < curMain ? 'done' : i === curMain ? 'now' : 'todo', sign: [...signs].reverse().find((x) => x.role === r && x.action === 'ky') };
  });
  const idx = d.status === 'duyet_them' ? d.apv?.idx ?? 0 : done ? lvs.length : -1;
  (done && !d.apv ? [] : lvs).forEach((l, i) => steps.push({ key: l.id, label: l.name, who: nm(l.user_id, l.group_id), sla: l.sla_h, extra: true,
    state: d.status === 'duyet_them' ? (i < idx ? 'done' : i === idx ? 'now' : 'todo') : done && d.apv ? 'done' : 'todo',
    sign: [...signs].reverse().find((x) => x.level === l.id && x.action === 'ky') }));
  const endLabel = proc === 'QT0' ? 'Hoàn tất' : d.company === 'HW' ? 'Khách ký tay' : 'Chuyển ' + COMPANY[d.company === 'PN' ? 'IPC' : 'HW'];
  const cur = steps.find((s) => s.state === 'now');
  if (cur && d.assignee) cur.who = short(people[d.assignee]?.full_name ?? '…') + ' (giao lại)';
  const el = (Date.now() - +new Date(d.status_at)) / 36e5; const left = cur ? cur.sla - el : 0;
  const tone = !cur ? 'ok' : left < 0 ? 'late' : left < cur.sla * 0.25 ? 'warn' : 'ok';
  const fail = d.status === 'fail';

  const events = [...signs.map((s) => ({ at: s.at, k: s.action, who: s.user, by: s.by, t: s.action === 'ky' ? (s.level ? lvs.find((l) => l.id === s.level)?.name ?? 'Duyệt thêm' : ROLE_NAME[s.role] ?? s.role) : s.action === 'tra_ve' ? 'Trả về' : s.action === 'fail' ? 'Fail' : s.action, note: s.note })),
    ...(d.notes ?? []).filter((n) => !signs.some((g) => g.note === n.text && Math.abs(+new Date(g.at) - +new Date(n.at)) < 6e4)).map((n) => ({ at: n.at, k: 'note', who: n.user, t: 'Ghi chú', note: n.text, by: (n as { by?: string }).by }))].sort((a, z) => z.at.localeCompare(a.at));

  return (
    <div className={'jn' + (open ? ' open' : '')}>
      <div className="jn-top">
      <button type="button" className="jn-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="jn-title"><Icon name="activity" size={15} />Hành trình duyệt</span></button>
      <ol className="jn-steps">
        {steps.map((s) => { const nm2 = s.state === 'done' && s.sign ? short(people[s.sign.user]?.full_name ?? s.who) : s.who;
          return <li key={s.key} className={'jn-st ' + s.state + (s.extra ? ' extra' : '') + (s.state === 'now' ? ' ' + tone : '') + (pk === s.key ? ' pk' : '')}>
            <button type="button" className="jn-dot jn-av" title={s.label + ' · ' + nm2} aria-label={s.label + ', ' + (s.state === 'done' ? 'đã ký' : s.state === 'now' ? 'đang làm' : 'chưa tới') + ', ' + nm2} aria-pressed={pk === s.key} onClick={() => setPk(pk === s.key ? '' : s.key)}>
              {ini(nm2)}{s.state === 'done' && <i className="jn-ok"><Icon name="check" size={9} /></i>}</button>
            {s.state === 'now' && <span className={'jn-wait ' + tone}><Icon name="clock" size={10} />{fmtLeft(el)}</span>}</li>; })}
        <li className={'jn-st end' + (done ? ' done' : ' todo')}><span className="jn-dot" title={endLabel} aria-label={endLabel} role="img"><Icon name={done ? 'check' : 'arrow'} size={11} /></span></li>
      </ol>
      <span className="jn-end">
        {fail ? <span className="jn-due late">Fail</span> : done ? <span className="jn-due ok"><Icon name="check" size={12} />Đã duyệt</span>
          : cur && <span className={'jn-due ' + tone}><Icon name={tone === 'late' ? 'alert' : 'clock'} size={12} />{left < 0 ? 'trễ ' + fmtLeft(left) : 'còn ' + fmtLeft(left)}</span>}
        <button type="button" className="jn-chev" data-sk="h" data-kbd="Shift H" data-kbd-label="Chi tiết hành trình" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Thu gọn hoạt động' : 'Xem hoạt động'}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg></button></span>
      </div>
      {(() => { const s = steps.find((x) => x.key === pk); if (!s) return null;
        const who = s.state === 'done' && s.sign ? people[s.sign.user]?.full_name ?? s.who : s.who;
        return <div className="jn-pick" role="status"><b>{s.label}</b> · {who}{s.state === 'done' && s.sign ? <span className="muted"> · {dt(s.sign.at)}</span> : s.state === 'now' ? <span className="muted"> · chờ {fmtLeft(el)}</span> : <span className="muted"> · chưa tới</span>}</div>; })()}
      {open && <ul className="jn-tl">
        {events.length === 0 && <li className="small muted">Chưa có hoạt động.</li>}
        {events.map((e, i) => <li key={i} className={'jn-ev ' + e.k}>
          <span className="jn-ic"><Icon name={e.k === 'ky' ? 'check' : e.k === 'tra_ve' ? 'back' : e.k === 'fail' ? 'alert' : 'file'} size={12} /></span>
          <div><b>{e.t}</b> · {people[e.who]?.full_name ?? '…'}{e.by && <span className="by-adm" title={'Thao tác bởi ' + (people[e.by]?.full_name ?? 'Admin') + ' (vào vai)'}>↪ {short(people[e.by]?.full_name ?? 'Admin')}</span>}<span className="small muted"> · {dt(e.at)}</span>{e.note && <div className="jn-note">{e.note}</div>}{(e.k === 'tra_ve' || e.k === 'fail') && <NoteImgs files={((d.files ?? []) as { kind: string; path: string; at?: string; by?: string }[]).filter((f) => f.kind === 'tra_ve' && f.at && Math.abs(+new Date(f.at) - +new Date(e.at)) < 3e5)} />}</div>
        </li>)}
      </ul>}
      {(cur || d.status !== 'da_duyet') && !fail && <Talk d={d} people={people} open={!!cur} />}
    </div>
  );
}

type Msg = { id: string; kind: string; from_user: string | null; to_users: string[]; text: string; via: string; meta: Record<string, string | number> & { tags?: string[] }; at: string; replied_at: string | null };
type Cand = { uid: string; name: string; pos: string | null; unit: string | null; zalo: boolean };
const vn = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
/** Chữ tin nhắn: tô đậm @Tên của người được nhắc */
function MsgText({ m, people }: { m: Msg; people: Record<string, Profile> }) {
  const names = (m.meta?.tags ?? []).map((u) => people[u]?.full_name).filter(Boolean) as string[];
  if (!names.length) return <>{m.text}</>;
  const re = new RegExp('(' + names.map((n) => '@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
  return <>{m.text.split(re).map((p, i) => (names.some((n) => '@' + n === p) ? <b key={i} className="tk-at">{p}</b> : p))}</>;
}
/** Ô trả lời có gợi ý @tên (chỉ người xem được phiếu / công ty) */
function MentionBox({ docId, busy, onSend, multi, placeholder, onCancel }: { docId: string; busy: boolean; onSend: (text: string, tags: string[]) => Promise<boolean>; multi?: boolean; placeholder?: string; onCancel?: () => void }) {
  const [v, setV] = useState(''); const [cands, setCands] = useState<Cand[] | null>(null); const [q, setQ] = useState<{ at: number; s: string } | null>(null); const [i, setI] = useState(0);
  const [tags, setTags] = useState<Record<string, string>>({}); const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const need = () => { if (cands === null) sb.rpc('mention_candidates', { p_doc: docId }).then(({ data }) => setCands((data as Cand[]) ?? [])); };
  const track = (val: string, pos: number) => { const m = /(^|\s)@([^\s@]{0,20})$/.exec(val.slice(0, pos)); if (m) { need(); setQ({ at: pos - m[2].length - 1, s: m[2] }); setI(0); } else setQ(null); };
  const hits = q && cands ? cands.filter((c) => vn(c.name).includes(vn(q.s))).slice(0, 6) : [];
  const pick = (c: Cand) => { if (!q) return; const end = q.at + 1 + q.s.length; const nv = v.slice(0, q.at) + '@' + c.name + ' ' + v.slice(end); setV(nv); setTags({ ...tags, [c.name]: c.uid }); setQ(null);
    requestAnimationFrame(() => { const p = q.at + c.name.length + 2; ref.current?.focus(); ref.current?.setSelectionRange(p, p); }); };
  const live = Object.entries(tags).filter(([n]) => v.includes('@' + n)).map(([, u]) => u);
  return <form className={multi ? 'tk-reply tk-multi' : 'tk-reply'} onSubmit={async (e) => { e.preventDefault(); if (q && hits[i]) { pick(hits[i]); return; } if (live.length > 5) { toast('Mỗi tin chỉ nhắc tối đa 5 người'); return; } if (await onSend(v, live)) { setV(''); setTags({}); } }}>
    {q && hits.length > 0 && <ul className="tk-men" role="listbox" aria-label="Nhắc tên">{hits.map((c, j) => <li key={c.uid} role="option" aria-selected={j === i}>
      <button type="button" className={j === i ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}><b>{c.name}</b><small>{[c.pos, c.unit].filter(Boolean).join(' · ')}</small>{c.zalo ? <span className="tk-mz" title="Đã nối Zalo">Zalo ✓</span> : <span className="tk-mz off" title="Chưa nối Zalo – chỉ báo trong app">chưa Zalo</span>}</button></li>)}</ul>}
    {q && cands && !hits.length && <div className="tk-men tk-men-none small muted">Không có ai tên “{q.s}” xem được phiếu này</div>}
    {(() => { const common = { ref, value: v, maxLength: 500, 'aria-autocomplete': 'list' as const,
      placeholder: placeholder ?? 'Trả lời / ghi chú… gõ @ để nhắc tên',
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setV(e.target.value); track(e.target.value, e.target.selectionStart ?? e.target.value.length); },
      onKeyDown: (e: KeyboardEvent) => { if (!q || !hits.length) return; if (e.key === 'ArrowDown') { e.preventDefault(); setI((i + 1) % hits.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI((i - 1 + hits.length) % hits.length); } else if (e.key === 'Escape') setQ(null); else if (e.key === 'Enter' && multi) { e.preventDefault(); pick(hits[i]); } },
      onBlur: () => setTimeout(() => setQ(null), 150) };
      return multi ? <><textarea rows={3} autoFocus {...common} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>{onCancel && <button type="button" className="btn" onClick={onCancel}>Huỷ</button>}
          <button className="btn primary" disabled={busy || !v.trim()}>{busy ? 'Đang gửi…' : 'Gửi Zalo'}</button></div></>
        : <><input {...common} /><button className="btn sm primary icon-btn" disabled={busy || !v.trim()} aria-label="Gửi"><Icon name="arrow" size={16} /></button></>; })()}
  </form>;
}
const KIND: Record<string, [string, string]> = { nudge: ['Nhắc việc', 'bell'], reply: ['Phản hồi', 'chat'], reassign: ['Giao lại', 'users'], auto: ['Tự động', 'clock'], note: ['Ghi chú', 'file'], turn: ['Chuyển bước', 'arrow'], back: ['Trả về', 'alert'] };

/** Trao đổi: nhắc việc / giao lại / phản hồi của người làm (cả qua Zalo) */
function Talk({ d, people, open }: { d: Doc; people: Record<string, Profile>; open: boolean }) {
  const [ms, setMs] = useState<Msg[]>([]); const [mgr, setMgr] = useState(false); const meId = useAuth().me?.id;
  const [mode, setMode] = useState<'' | 'nudge' | 'reassign'>(''); const [txt, setTxt] = useState(''); const [to, setTo] = useState(''); const [rep, setRep] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [exp, setExp] = useState(false);
  const load = () => sb.from('order_msgs').select('*').eq('doc_id', d.id).order('at').then(({ data }) => setMs((data as Msg[]) ?? []));
  const tkBox = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = (e: Event) => { const x = (e as CustomEvent<{ doc: string; mode: 'nudge' | 'reassign' }>).detail; if (x?.doc !== d.id || !mgr) return; setExp(true); setMode(x.mode); setErr('');
    requestAnimationFrame(() => tkBox.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })); };
    addEventListener('pp-talk', f); return () => removeEventListener('pp-talk', f); }, [d.id, mgr]);
  useEffect(() => { load(); if (open) sb.rpc('can_manage_doc', { p_doc: d.id }).then(({ data }) => setMgr(!!data)); else setMgr(false);
    const ch = sb.channel('msgs-' + d.id).on('postgres_changes', { event: '*', schema: 'public', table: 'order_msgs', filter: 'doc_id=eq.' + d.id }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); }; }, [d.id, d.status, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const nm = (u: string | null) => (u ? short(people[u]?.full_name ?? '…') : 'Hệ thống');
  const run = async (fn: string, args: Record<string, unknown>, ok: string) => { setBusy(true); setErr('');
    const { data, error } = await sb.rpc(fn, args); setBusy(false);
    if (error) { setErr(errText(error)); return false; }
    toast(fn === 'nudge' ? (data ? ok + ' · đã gửi Zalo ' + data + ' người' : ok + ' · người nhận chưa liên kết Zalo') : ok); load(); return true; };
  const lastNudge = [...ms].reverse().find((m) => m.kind === 'nudge');
  const waitH = lastNudge && !lastNudge.replied_at ? (Date.now() - +new Date(lastNudge.at)) / 36e5 : 0;
  const users = Object.values(people).filter((p) => p.active !== false).sort((a, z) => a.full_name.localeCompare(z.full_name));
  if (!ms.length && !open) return null;
  return (
    <div className="tk" ref={tkBox}>
      <div className="tk-head"><button type="button" className="tk-tog" data-sk="d" data-kbd="Shift D" data-kbd-label="Trao đổi" aria-expanded={exp} onClick={() => setExp(!exp)}><Icon name="chat" size={14} /><b>Trao đổi</b>{ms.length > 0 && <span className="tk-n">{ms.length}</span>}<span className={'tk-car' + (exp ? ' on' : '')}>▾</span></button>
        {!exp && ms.length > 0 && <span className="tk-last small muted" onClick={() => setExp(true)}><b>{nm(ms[ms.length - 1].from_user)}:</b> {ms[ms.length - 1].text}</span>}
        {lastNudge && <span className={'tk-st ' + (lastNudge.replied_at ? 'ok' : waitH >= 4 ? 'late' : 'wait')}>{lastNudge.replied_at ? 'Đã phản hồi' : waitH >= 4 ? 'Chưa phản hồi ' + fmtLeft(waitH) : 'Chờ phản hồi'}</span>}
        {mgr && <span className="tk-acts">
          <button data-sk="n" data-kbd="Shift N" className={'btn sm' + (mode === 'nudge' ? ' primary' : '')} onClick={() => { setExp(true); setMode(mode === 'nudge' ? '' : 'nudge'); setErr(''); }}><Icon name="bell" size={14} />Nhắc việc</button>
          <button data-sk="g" data-kbd="Shift G" className={'btn sm' + (mode === 'reassign' ? ' primary' : '')} onClick={() => { setExp(true); setMode(mode === 'reassign' ? '' : 'reassign'); setErr(''); }}><Icon name="users" size={14} />Giao lại</button>
        </span>}
      </div>
      {mode === 'nudge' && <div className="tk-form">
        <MentionBox docId={d.id} busy={busy} multi placeholder="Nội dung gửi Zalo cho người đang làm… gõ @ để nhắc thêm người" onCancel={() => setMode('')}
          onSend={async (text, tags) => { const ok = await run('nudge', { p_doc: d.id, p_text: text, p_tags: tags }, tags.length ? 'Đã nhắc + ' + tags.length + ' người được tag' : 'Đã nhắc'); if (ok) setMode(''); return ok; }} />
      </div>}
      {mode === 'reassign' && <div className="tk-form">
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Giao cho"><option value="">– Giao cho ai –</option>{users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
        <textarea rows={2} placeholder="Lý do giao lại *" value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={300} />
        <p className="small muted" style={{ margin: 0 }}>Chỉ áp dụng cho bước hiện tại của phiếu này. Bước sau quay về người phụ trách theo quy trình.</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setMode('')}>Huỷ</button>
          <button className="btn primary" disabled={busy || !to || !txt.trim()} onClick={async () => { if (await run('reassign_doc', { p_doc: d.id, p_user: to, p_note: txt }, 'Đã giao lại cho ' + people[to]?.full_name)) { setTxt(''); setTo(''); setMode(''); location.reload(); } }}>{busy ? 'Đang giao…' : 'Giao lại'}</button></div>
      </div>}
      {err && <div className="msg err" role="alert"><Icon name="alert" size={16} /><span>{err}</span></div>}
      {exp && ms.length > 0 && <ul className="tk-list" ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>{ms.map((m) => { const [lb, ic] = KIND[m.kind] ?? [m.kind, 'file'];
        return <li key={m.id} className={'tk-m ' + m.kind + (meId && m.meta?.tags?.includes(meId) ? ' tk-me' : '')}><span className="tk-ic"><Icon name={ic} size={12} /></span>
          <div><div className="tk-meta"><b>{nm(m.from_user)}</b> · {lb}{m.kind === 'reassign' && m.meta?.to_name ? ' → ' + m.meta.to_name : ''}{m.via === 'zalo' ? <span className="tk-via">Zalo</span> : null}<span className="small muted"> · {dt(m.at)}</span></div>
            <div className="tk-txt"><MsgText m={m} people={people} /></div>{/kèm \d+ ảnh/.test(m.text) && <RtThumbs files={rtFilesAt(d, m.at)} size={56} />}</div></li>; })}</ul>}
      {open && exp && <MentionBox docId={d.id} busy={busy} onSend={async (text, tags) => { setBusy(true); setErr('');
        const { data, error } = await sb.rpc('reply_msg_tag', { p_doc: d.id, p_text: text, p_tags: tags }); setBusy(false);
        if (error) { setErr(errText(error)); return false; } const r = data as { zalo: number; no_zalo: string[] };
        toast(tags.length ? 'Đã gửi · nhắc ' + tags.length + ' người' + (r.no_zalo.length ? ' · ' + r.no_zalo.join(', ') + ' chưa nối Zalo – chỉ báo trong app' : ' qua chuông + Zalo') : 'Đã gửi'); load(); return true; }} />}
    </div>
  );
}

/** Ảnh ghi chú kèm lượt trả về / thất bại */
function NoteImgs({ files }: { files: { path: string }[] }) {
  const [u, setU] = useState<Record<string, string>>({});
  useEffect(() => { if (!files.length) return; sb.storage.from('files').createSignedUrls(files.map((f) => f.path), 3600).then(({ data }) => setU(Object.fromEntries((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path!, x.signedUrl])))); }, [files.map((f) => f.path).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!files.length) return null;
  return <div className="jn-imgs">{files.map((f, i) => u[f.path] ? <a key={f.path} href={u[f.path]} target="_blank" rel="noreferrer" aria-label={'Mở ảnh ghi chú ' + (i + 1)}><img src={u[f.path]} alt="" loading="lazy" /></a> : <span key={f.path} className="jn-imgs-ph" />)}</div>;
}
