import { useEffect, useState } from 'react';
import { sb, type Profile } from '../lib/supabase';
import { dt } from '../lib/format';
import { COMPANY, FLOW, ROLE_NAME, ROLE_OF, STATUS, type Doc, type Proc } from '../lib/proc';
import { Icon } from './Icon';

type CP = { role: string; user_id: string | null; group_id: string | null; sla_h: number | null };
type LV = { id: string; name: string; user_id: string | null; group_id: string | null; sla_h: number };
type Sign = { role: string; user: string; at: string; action: string; note?: string; level?: string };
type St = { key: string; label: string; who: string; sla: number; state: 'done' | 'now' | 'todo'; sign?: Sign; extra?: boolean };

const short = (n: string) => n.split(' ').slice(-2).join(' ');
const fmtLeft = (h: number) => (Math.abs(h) >= 24 ? Math.round(Math.abs(h) / 24) + ' ngày' : Math.max(1, Math.round(Math.abs(h))) + 'h');

/** Hành trình duyệt: stepper + timeline (bấm để mở) */
export function Journey({ d, proc, people }: { d: Doc & { apv?: { queue: string[]; idx: number } }; proc: Proc; people: Record<string, Profile> }) {
  const [cp, setCp] = useState<CP[]>([]); const [lvs, setLvs] = useState<LV[]>([]); const [gs, setGs] = useState<Record<string, string>>({});
  const [dl, setDl] = useState<{ user_id: string; to_user: string }[]>([]); const [open, setOpen] = useState(false);
  const company = proc === 'QT0' ? 'PN' : d.company;
  useEffect(() => {
    sb.from('chain_people').select('role, user_id, group_id, sla_h').eq('proc', proc).eq('company', company).then(({ data }) => setCp((data as CP[]) ?? []));
    const q = sb.from('approval_levels').select('id, name, user_id, group_id, sla_h, ord');
    (d.apv?.queue?.length ? q.in('id', d.apv.queue) : q.eq('proc', proc).eq('company', company).eq('active', true)).order('ord')
      .then(({ data }) => { const l = (data as LV[]) ?? []; setLvs(d.apv?.queue?.length ? d.apv.queue.map((id) => l.find((x) => x.id === id)!).filter(Boolean) : l); });
    sb.from('work_groups').select('id, name').then(({ data }) => setGs(Object.fromEntries(((data as { id: string; name: string }[]) ?? []).map((g) => [g.id, g.name]))));
    const today = new Date().toISOString().slice(0, 10);
    sb.from('delegations').select('user_id, to_user, from_date, to_date').lte('from_date', today).gte('to_date', today).then(({ data }) => setDl((data as { user_id: string; to_user: string }[]) ?? []));
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
  const el = (Date.now() - +new Date(d.status_at)) / 36e5; const left = cur ? cur.sla - el : 0;
  const tone = !cur ? 'ok' : left < 0 ? 'late' : left < cur.sla * 0.25 ? 'warn' : 'ok';
  const fail = d.status === 'fail';

  const events = [...signs.map((s) => ({ at: s.at, k: s.action, who: s.user, t: s.action === 'ky' ? (s.level ? lvs.find((l) => l.id === s.level)?.name ?? 'Duyệt thêm' : ROLE_NAME[s.role] ?? s.role) : s.action === 'tra_ve' ? 'Trả về' : s.action === 'fail' ? 'Fail' : s.action, note: s.note })),
    ...(d.notes ?? []).filter((n) => !signs.some((g) => g.note === n.text && Math.abs(+new Date(g.at) - +new Date(n.at)) < 6e4)).map((n) => ({ at: n.at, k: 'note', who: n.user, t: 'Ghi chú', note: n.text }))].sort((a, z) => z.at.localeCompare(a.at));

  return (
    <div className={'jn' + (open ? ' open' : '')}>
      <button className="jn-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="jn-title"><Icon name="activity" size={15} />Hành trình duyệt</span>
        {fail ? <span className="jn-due late">Fail</span> : done ? <span className="jn-due ok"><Icon name="check" size={12} />Đã duyệt</span>
          : cur && <span className={'jn-due ' + tone}><Icon name={tone === 'late' ? 'alert' : 'clock'} size={12} />{left < 0 ? 'trễ ' + fmtLeft(left) : 'còn ' + fmtLeft(left)}</span>}
        <span className="jn-chev"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg></span>
      </button>
      <ol className="jn-steps">
        {steps.map((s) => (
          <li key={s.key} className={'jn-st ' + s.state + (s.extra ? ' extra' : '') + (s.state === 'now' ? ' ' + tone : '')}>
            <span className="jn-dot">{s.state === 'done' ? <Icon name="check" size={12} /> : s.extra ? <Icon name="shield" size={11} /> : null}</span>
            <span className="jn-lb"><b>{s.label}</b><span>{s.state === 'done' && s.sign ? short(people[s.sign.user]?.full_name ?? s.who) : s.who}</span>
              {s.state === 'now' && <em>chờ {fmtLeft(el)}</em>}</span>
          </li>))}
        <li className={'jn-st end' + (done ? ' done' : ' todo')}><span className="jn-dot"><Icon name={done ? 'check' : 'arrow'} size={11} /></span><span className="jn-lb"><b>{endLabel}</b></span></li>
      </ol>
      {open && <ul className="jn-tl">
        {events.length === 0 && <li className="small muted">Chưa có hoạt động.</li>}
        {events.map((e, i) => <li key={i} className={'jn-ev ' + e.k}>
          <span className="jn-ic"><Icon name={e.k === 'ky' ? 'check' : e.k === 'tra_ve' ? 'back' : e.k === 'fail' ? 'alert' : 'file'} size={12} /></span>
          <div><b>{e.t}</b> · {people[e.who]?.full_name ?? '…'}<span className="small muted"> · {dt(e.at)}</span>{e.note && <div className="jn-note">{e.note}</div>}</div>
        </li>)}
      </ul>}
    </div>
  );
}
