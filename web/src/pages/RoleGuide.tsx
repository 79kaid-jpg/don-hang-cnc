import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { sb } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { COMPANY, FINAL, FLOW, NEXT_LABEL, PROC_NAME, ROLE_OF, STATUS, type Company, type Proc } from '../lib/proc';
import { fieldsOf, permOf, useFields } from '../lib/fields';
import { itemsOf, useChecks, LEVEL_NAME } from '../lib/checks';
import { useGuides, guideFor, guideByKey } from '../lib/guides';
import { GuideBox } from '../components/GuideBox';
import { Icon } from '../components/Icon';

/** Hướng dẫn theo người: mỗi người thấy các bước mình làm trong một đơn, theo đúng thứ tự, kèm ảnh chụp từ đơn mẫu chạy thật. */
type CP = { proc: Proc; company: Company; role: string; user_id: string | null; group_id: string | null; sla_h: number | null };
type Task = { key: string; proc: Proc; co: Company; st: string; via?: string; sla: number };
const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
const COS: Company[] = ['PN', 'IPC', 'HW'];
const PHIEU: Record<Proc, string> = { QT0: 'Danh sách tấm', QT1: 'Xác nhận đơn hàng', QT2: 'Lệnh gia công', QT3: 'Phiếu xuất kho kiêm BB giao hàng' };
const BLOCK: Record<string, string[]> = {
  'QT0.boc_tach': ['Chưa đính kèm Excel bóc tách'], 'QT0.tao_ds': ['Bảng danh sách tấm trống'],
  'QT1.lap': ['Bảng danh sách tấm trống', 'Còn dòng chưa có đơn giá'], 'QT1.duyet': ['Còn dòng chưa có đơn giá'],
  'QT2.lap': ['Thiếu số lệnh', 'Thiếu bảng nguyên liệu hoặc thành phẩm'], 'QT3.lap': ['Bảng thành phẩm trống'] };
const ord = (t: Task) => PROCS.indexOf(t.proc) * 100 + COS.indexOf(t.co) * 10 + (t.st === 'ky' ? 9 : t.st === 'tao_don' ? -1 : FLOW[t.proc].indexOf(t.st));
const img = (n: string) => import.meta.env.BASE_URL + 'hd/' + n + '.webp';
/** Ảnh chụp có sẵn cho bước này không (đơn mẫu chạy đủ các bước, trừ ký tay) */
const hasShot = (t: Task) => t.st !== 'ky';

export default function RoleGuide() {
  useFields(); const tpl = useChecks(); const guides = useGuides(); const { me } = useAuth();
  const [cp, setCp] = useState<CP[]>([]); const [ppl, setPpl] = useState<Record<string, string>>({}); const [gs, setGs] = useState<Record<string, { name: string; member_ids: string[] }>>({});
  const [who, setWho] = useState(''); const [makers, setMakers] = useState<string[]>([]); const [zoom, setZoom] = useState('');
  useEffect(() => { Promise.all([sb.from('chain_people').select('*'), sb.from('profiles').select('id, full_name, active, roles'), sb.from('work_groups').select('id, name, member_ids')]).then(([a, b, c]) => {
    const pr = ((b.data ?? []) as { id: string; full_name: string; active: boolean; roles: string[] }[]).filter((x) => x.active);
    setCp((a.data as CP[]) ?? []); setPpl(Object.fromEntries(pr.map((x) => [x.id, x.full_name]))); setMakers(pr.filter((x) => x.roles?.some((r) => r === 'kinh_doanh' || r === 'admin_cnc')).map((x) => x.id));
    setGs(Object.fromEntries(((c.data ?? []) as { id: string; name: string; member_ids: string[] }[]).map((g) => [g.id, g]))); }); }, []);
  useEffect(() => { if (!zoom) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(''); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [zoom]);

  // người → các bước
  const tasks = useMemo(() => { const m: Record<string, Task[]> = {};
    const add = (u: string, t: Task) => { (m[u] ??= []).some((x) => x.key === t.key) || m[u].push(t); };
    for (const c of cp) { const us = c.user_id ? [c.user_id] : c.group_id ? gs[c.group_id]?.member_ids ?? [] : []; const via = c.group_id ? gs[c.group_id]?.name : undefined;
      const steps = c.role === 'hoan_tat' ? ['ky'] : FLOW[c.proc]?.filter((st) => ROLE_OF[st] === c.role) ?? [];
      for (const u of us) { if (!ppl[u]) continue;
        for (const st of steps) add(u, { key: `${c.proc}.${c.company}.${st}`, proc: c.proc, co: c.company, st, via, sla: c.sla_h ?? 48 }); } }
    for (const u of makers) if (ppl[u]) add(u, { key: 'QT0.PN.tao_don', proc: 'QT0', co: 'PN', st: 'tao_don', sla: 0 });
    Object.values(m).forEach((l) => l.sort((a, z) => ord(a) - ord(z))); return m; }, [cp, gs, ppl, makers]);
  const people = useMemo(() => Object.keys(tasks).sort((a, z) => (ppl[a] ?? '').localeCompare(ppl[z] ?? '')), [tasks, ppl]);
  useEffect(() => { if (!who && people.length) setWho(me && tasks[me.id] ? me.id : people[0]); }, [people]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = tasks[who] ?? [];
  const nameOf = (co: Company, role: string, p: Proc) => { const c = cp.find((x) => x.proc === p && x.company === co && x.role === role); if (!c) return '';
    return c.user_id ? ppl[c.user_id] ?? '' : c.group_id ? gs[c.group_id]?.name ?? '' : ''; };
  const nextOf = (t: Task): string => { if (t.st === 'tao_don') return 'Bóc tách kỹ thuật · ' + nameOf('PN', 'ky_thuat', 'QT0');
    const f = FLOW[t.proc]; const i = f.indexOf(t.st);
    if (t.st !== 'ky' && i < f.length - 1) return STATUS[f[i + 1]] + ' · ' + nameOf(t.co, ROLE_OF[f[i + 1]], t.proc);
    if (t.proc === 'QT0') return 'Danh sách tấm đã duyệt → mở QT1';
    const ci = COS.indexOf(t.co); if (t.st !== 'ky' && ci < 2) return 'App tự tạo phiếu ' + PHIEU[t.proc] + ' cho ' + COMPANY[COS[ci + 1]] + ' (bước Lập)';
    if (t.st !== 'ky') return 'In phiếu → ' + FINAL[t.proc] + ' → tải bản ký';
    return t.proc === 'QT3' ? 'Đơn hoàn tất' : 'Sang ' + (t.proc === 'QT1' ? 'QT2 – Lệnh gia công' : 'QT3 – Giao hàng'); };
  const reqF = (t: Task) => [...fieldsOf(t.proc, 'header'), ...fieldsOf(t.proc, 'file')].filter((f) => permOf(f, t.co, t.st, t.proc) === 'required').map((f) => f.label);

  const Card = ({ t, n }: { t: Task; n: number }) => {
    const ck = t.st === 'ky' || t.st === 'tao_don' ? [] : itemsOf(tpl, t.proc, t.st); const rf = t.st === 'ky' || t.st === 'tao_don' ? [] : reqF(t);
    const bl = BLOCK[t.proc + '.' + t.st] ?? []; const g = t.st === 'tao_don' ? guideByKey(guides, 'sim.start') : t.st === 'ky' ? guideByKey(guides, 'sim.final') : guideFor(guides, t.proc, t.co, t.st);
    const title = t.st === 'tao_don' ? 'Tạo đơn hàng mới' : t.st === 'ky' ? 'Tải bản ' + FINAL[t.proc].toLowerCase() : STATUS[t.st];
    const shot = t.st === 'tao_don' ? 'tao-don' : `${t.proc}-${t.co}-${t.st}`;
    return <li className="rg-card" id={'b-' + n}>
      <div className="rg-num" aria-hidden="true">{n}</div>
      <div className="rg-body">
        <div className="rg-tags"><span className={'rg-qt q' + t.proc.slice(2)}>{t.proc}</span><span className={'pd-tag c-' + t.co}>{COMPANY[t.co]}</span>{t.via && <span className="rg-via">qua {t.via}</span>}</div>
        <h3>{title}</h3>
        <dl className="rg-dl">
          <dt>Khi nào</dt><dd>{t.st === 'tao_don' ? 'Khi khách gửi bản vẽ / yêu cầu báo giá.' : t.st === 'ky' ? 'Khi phiếu đã duyệt và đã có bản giấy ký tay.' : <>Bot Zalo + chuông báo <b>“Đến lượt bạn: {STATUS[t.st]}”</b>. Mở <b>Việc của tôi</b> hoặc bấm link trong tin.</>}</dd>
          <dt>Ở đâu</dt><dd>{t.st === 'tao_don' ? <>Danh sách đơn → <b>Tạo đơn mới</b> (hoặc phím <span className="kbd">N</span>)</> : <>Đơn hàng → tab <b>{t.proc} · {PROC_NAME[t.proc]}</b> → phiếu <b>{COMPANY[t.co]}</b></>}</dd>
          {t.sla > 0 && <><dt>Hạn</dt><dd>{t.sla} giờ kể từ lúc đến lượt</dd></>}
          {t.st !== 'ky' && t.st !== 'tao_don' && <><dt>Bấm</dt><dd><span className="kbd">{NEXT_LABEL[t.st] ?? 'Duyệt'}</span>{t.st !== FLOW[t.proc][0] && <> · sai thì <span className="kbd">Trả về</span> kèm lý do</>}</dd></>}
          {(rf.length > 0 || bl.length > 0) && <><dt>Không chuyển được khi</dt><dd><ul className="pd-ul">{bl.map((b) => <li key={b}>{b}</li>)}{rf.length > 0 && <li>Thiếu: {rf.join(', ')}</li>}</ul></dd></>}
          <dt>Tiếp theo</dt><dd>{nextOf(t)}</dd>
        </dl>
        <GuideBox g={g} vars={{ cty: COMPANY[t.co], phieu: PHIEU[t.proc] }} hidePurpose={false} />
        {ck.length > 0 && <><div className="gd-h">Checklist</div><ul className="pd-ck">{ck.map((c) => <li key={c.id}><span className={'sc-lv ' + c.level}>{LEVEL_NAME[c.level]}</span>{c.label}{c.auto && <span className="pd-auto" title="App tự kiểm">⚡</span>}</li>)}</ul></>}
        {hasShot(t) && <button type="button" className="rg-shot" onClick={() => setZoom(shot)} aria-label={'Phóng to ảnh: ' + title}>
          <img src={img(shot)} alt={'Màn hình bước ' + title + ' – ' + COMPANY[t.co]} loading="lazy" width={1280} height={860} onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
          <span className="rg-zoom"><Icon name="search" size={14} />Phóng to</span></button>}
      </div></li>;
  };

  return <div className="rg">
    <div className="page-head"><div><h1>Hướng dẫn theo người</h1><p className="muted">Chọn tên bạn để xem các bước bạn làm trong một đơn, theo đúng thứ tự. Ảnh chụp từ đơn mẫu chạy thật.</p></div>
      <div className="row"><NavLink className="btn sm" to="/quy-trinh"><Icon name="flow" size={16} />Toàn bộ quy trình</NavLink><NavLink className="btn sm" to="/cai-app"><Icon name="back" size={16} />Hướng dẫn chung</NavLink></div></div>
    <div className="rg-wrap">
      <nav className="rg-people" aria-label="Chọn người">
        <label className="rg-sel"><span className="small muted">Người</span><select value={who} onChange={(e) => setWho(e.target.value)}>{people.map((u) => <option key={u} value={u}>{ppl[u]} · {tasks[u].length} bước</option>)}</select></label>
        <ul>{people.map((u) => <li key={u}><button className={u === who ? 'on' : ''} aria-current={u === who ? 'true' : undefined} onClick={() => { setWho(u); scrollTo({ top: 0 }); }}>
          <span className="avatar sm" aria-hidden="true">{(ppl[u] ?? '?').trim()[0]}</span><span className="rg-pn">{ppl[u]}{me?.id === u && <small> (bạn)</small>}</span><span className="rg-cnt">{tasks[u].length}</span></button></li>)}</ul>
      </nav>
      <section className="rg-main" aria-live="polite">
        {who && <div className="rg-sum card"><b>{ppl[who]}</b> làm <b>{list.length} bước</b> trong mỗi đơn:
          <ol className="rg-chips">{list.map((t, i) => <li key={t.key}><a href={'#b-' + (i + 1)} onClick={(e) => { e.preventDefault(); document.getElementById('b-' + (i + 1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            <span className={'rg-qt q' + t.proc.slice(2)}>{t.proc}</span>{t.co !== 'PN' || t.proc !== 'QT0' ? COMPANY[t.co] + ' · ' : ''}{t.st === 'tao_don' ? 'Tạo đơn' : t.st === 'ky' ? 'Bản ký tay' : STATUS[t.st]}</a></li>)}</ol></div>}
        {!people.length && <p className="muted">Đang tải…</p>}
        <ol className="rg-list">{list.map((t, i) => <Card key={t.key} t={t} n={i + 1} />)}</ol>
        {who && <div className="card rg-tips"><b>Mẹo chung</b><ul className="ins-ul">
          <li>Trả lời / hỏi lại ngay trong mục <b>Trao đổi</b> của phiếu, gõ <span className="kbd">@</span> để nhắc người khác. Hoặc nhắn thẳng cho bot Zalo.</li>
          <li>Bấm 💡 cạnh tên bước trong phiếu để xem lại hướng dẫn này.</li>
          <li>Phiếu bị <b>Trả về</b>: đọc lý do trong Hành trình duyệt, sửa các ô tô vàng rồi gửi lại.</li></ul></div>}
      </section>
    </div>
    {zoom && <div className="rg-zbg" role="dialog" aria-label="Ảnh phóng to" onClick={() => setZoom('')}><img src={img(zoom)} alt="" /><button className="btn sm rg-zx" aria-label="Đóng"><Icon name="x" size={16} /></button></div>}
  </div>;
}
