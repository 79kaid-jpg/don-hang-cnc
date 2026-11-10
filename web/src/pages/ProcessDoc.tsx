import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { sb } from '../lib/supabase';
import { COMPANY, FINAL, FLOW, PROC_NAME, STATUS, ROLE_OF, type Proc, type Company } from '../lib/proc';
import { fieldsOf, colsOf, tablesOf, permOf, useFields } from '../lib/fields';
import { itemsOf, useChecks, LEVEL_NAME } from '../lib/checks';
import { useGuides, guideFor, guideByKey } from '../lib/guides';
import { GuideBox } from '../components/GuideBox';
import { Icon } from '../components/Icon';

/** Tài liệu quy trình SỐNG: đọc trực tiếp cấu hình hiện tại (người phụ trách, checklist, hướng dẫn, trường) */
const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
const PHIEU: Record<Proc, string> = { QT0: 'Danh sách tấm', QT1: 'Xác nhận đơn hàng', QT2: 'Lệnh gia công', QT3: 'Phiếu xuất kho kiêm BB giao hàng' };
const BLOCK: Record<string, string[]> = {
  'QT0.boc_tach': ['Chưa đính kèm Excel bóc tách'], 'QT0.tao_ds': ['Bảng danh sách tấm trống'],
  'QT1.lap': ['Bảng danh sách tấm trống', 'Còn dòng chưa có đơn giá'], 'QT1.duyet': ['Còn dòng chưa có đơn giá'],
  'QT2.lap': ['Thiếu số lệnh', 'Thiếu bảng nguyên liệu hoặc thành phẩm'], 'QT3.lap': ['Bảng thành phẩm trống'] };
const AFTER: Record<Proc, string> = { QT0: 'Duyệt → danh sách tấm đã ký (đầu vào QT1) · hoặc Thất bại', QT1: '', QT2: '', QT3: '' };
type CP = { proc: string; company: string; role: string; user_id: string | null; group_id: string | null; sla_h: number | null };
type Sel = { co: Company | 'KY'; st: string };

export default function ProcessDoc() {
  useFields(); const tpl = useChecks(); const guides = useGuides();
  const [p, setP] = useState<Proc>('QT0'); const [sel, setSel] = useState<Sel>({ co: 'PN', st: 'tiep_nhan' });
  const [cp, setCp] = useState<CP[]>([]); const [ppl, setPpl] = useState<Record<string, string>>({}); const [gs, setGs] = useState<Record<string, { name: string; member_ids: string[] }>>({});
  useEffect(() => { Promise.all([sb.from('chain_people').select('*'), sb.from('profiles').select('id, full_name'), sb.from('work_groups').select('id, name, member_ids')]).then(([a, b, c]) => {
    setCp((a.data as CP[]) ?? []); setPpl(Object.fromEntries(((b.data ?? []) as { id: string; full_name: string }[]).map((x) => [x.id, x.full_name])));
    setGs(Object.fromEntries(((c.data ?? []) as { id: string; name: string; member_ids: string[] }[]).map((g) => [g.id, g]))); }); }, []);
  const cos: Company[] = p === 'QT0' ? ['PN'] : ['PN', 'IPC', 'HW'];
  const go = (x: Sel) => { setSel(x); if (matchMedia('(max-width:1100px)').matches) setTimeout(() => document.querySelector('.pd-side')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const pick = (np: Proc) => { setP(np); setSel({ co: 'PN', st: FLOW[np][0] }); };
  const who = (co: string, role: string) => { const c = cp.find((x) => x.proc === p && x.company === co && x.role === role); if (!c) return { names: 'Chưa gán', sla: 48 };
    const names = c.user_id ? ppl[c.user_id] ?? '…' : c.group_id ? (gs[c.group_id]?.member_ids ?? []).map((i) => ppl[i]).filter(Boolean).join(', ') || gs[c.group_id]?.name : 'Chưa gán';
    return { names: names ?? 'Chưa gán', sla: c.sla_h ?? 48 }; };
  const reqFields = (co: string, st: string) => [...fieldsOf(p, 'header'), ...fieldsOf(p, 'file')].filter((f) => permOf(f, co, st, p) === 'required').map((f) => f.label);
  const rows = useMemo(() => cos.flatMap((co) => FLOW[p].map((st) => ({ co, st }))), [p]); // eslint-disable-line react-hooks/exhaustive-deps

  const Detail = ({ co, st }: Sel) => {
    if (co === 'KY') { const fc = (cp.find((x) => x.proc === p && x.role === 'hoan_tat')?.company ?? 'HW') as Company; const w = who(fc, 'hoan_tat'); return <div className="pd-det">
      <div className="pd-det-h"><span className="pd-tag ky">Ký tay</span><h3>{FINAL[p]}</h3></div>
      <dl className="pd-dl"><dt>Ai</dt><dd>Khách / kho ký trên bản in → <b>{w.names}</b> ({COMPANY[fc]}) tải bản ký và hoàn tất</dd></dl>
      <GuideBox g={guideByKey(guides, 'sim.final')} /></div>; }
    const role = ROLE_OF[st]; const w = who(co, role); const ck = itemsOf(tpl, p, st); const rf = reqFields(co, st); const bl = BLOCK[p + '.' + st] ?? [];
    return <div className="pd-det">
      <div className="pd-det-h"><span className={'pd-tag c-' + co}>{COMPANY[co]}</span><h3>{STATUS[st]}</h3></div>
      <dl className="pd-dl"><dt>Ai làm</dt><dd><b>{w.names}</b></dd><dt>Hạn</dt><dd>{w.sla} giờ</dd>
        {(rf.length > 0 || bl.length > 0 || ck.some((c) => c.level === 'req')) && <><dt>Chặn chuyển khi</dt><dd><ul className="pd-ul">
          {bl.map((b) => <li key={b}>{b}</li>)}{rf.length > 0 && <li>Thiếu: {rf.join(', ')}</li>}{ck.some((c) => c.level === 'req') && <li>Checklist bắt buộc chưa đủ</li>}</ul></dd></>}
        {st !== FLOW[p][0] && <><dt>Trả về</dt><dd>{p === 'QT0' ? 'Bước trước' : 'Bước Lập của ' + COMPANY[co]}, ghi lý do</dd></>}
      </dl>
      <GuideBox g={guideFor(guides, p, co, st)} vars={{ cty: COMPANY[co], phieu: PHIEU[p] }} />
      {ck.length > 0 && <><div className="gd-h">Checklist</div><ul className="pd-ck">{ck.map((c) => <li key={c.id}><span className={'sc-lv ' + c.level}>{LEVEL_NAME[c.level]}</span>{c.label}{c.auto && <span className="pd-auto" title="Tự kiểm">⚡</span>}</li>)}</ul></>}
    </div>;
  };

  return (
    <div className="pd">
      <div className="page-head pd-head"><div><h1>Tài liệu quy trình đơn hàng</h1><p className="muted">Luôn theo cấu hình hiện tại của app.</p></div>
        <div className="row"><NavLink className="btn sm" to="/cai-app"><Icon name="back" size={16} />Hướng dẫn</NavLink><button className="btn sm" onClick={() => print()}><Icon name="print" size={16} />In</button></div></div>
      <div className="pd-tabs" role="tablist">{PROCS.map((x) => <button key={x} role="tab" aria-selected={p === x} className={'q' + x.slice(2) + (p === x ? ' on' : '')} onClick={() => pick(x)}><b>{x}</b><span>{PROC_NAME[x]}</span></button>)}</div>

      <section className="pd-main">
        <div className="pd-lanes" style={{ ['--n' as string]: FLOW[p].length + (p === 'QT0' ? 0 : 1) }}>
          {cos.map((co, ci) => <div key={co} className={'pd-lane c-' + co}>
            <div className="pd-lh">{COMPANY[co]}</div>
            <ol className="pd-steps">{FLOW[p].map((st, k) => { const on = sel.co === co && sel.st === st; const n = itemsOf(tpl, p, st).filter((c) => c.level === 'req').length;
              return <li key={st}><button className={'pd-node' + (on ? ' on' : '')} aria-pressed={on} onClick={() => go({ co, st })}>
                <span className="pd-n">{p === 'QT0' ? k + 1 : ci * 3 + k + 1}</span><span className="pd-t"><b>{STATUS[st]}</b><small>{who(co, ROLE_OF[st]).names}</small></span>{n > 0 && <span className="pd-cnt" title={n + ' mục checklist bắt buộc'}>✓{n}</span>}</button></li>; })}
              {p !== 'QT0' && <li className="pd-hand" aria-hidden="true">{co === 'HW' ? '' : '→ ' + (co === 'PN' ? 'IPC' : 'Hanwa')}</li>}</ol>
          </div>)}
          {p !== 'QT0' ? <div className="pd-lane ky"><div className="pd-lh">Ký tay</div><ol className="pd-steps"><li><button className={'pd-node' + (sel.co === 'KY' ? ' on' : '')} onClick={() => go({ co: 'KY', st: 'ky' })}>
            <span className="pd-n">✍</span><span className="pd-t"><b>{FINAL[p]}</b><small>{(() => { const fc = (cp.find((x) => x.proc === p && x.role === 'hoan_tat')?.company ?? 'HW') as Company; return 'rồi ' + COMPANY[fc] + ' hoàn tất · ' + who(fc, 'hoan_tat').names; })()}</small></span></button></li></ol></div>
            : <p className="small muted pd-after">{AFTER.QT0}</p>}
        </div>
        <aside className="pd-side"><Detail {...sel} /></aside>
      </section>

      <section className="card pd-table"><h2>Bảng bước · {p}</h2>
        <div className="tbl-wrap"><table className="pp-grid"><thead><tr><th>#</th><th>Công ty</th><th>Bước</th><th>Người</th><th>Hạn</th><th>Checklist bắt buộc</th><th>Chặn chuyển khi</th></tr></thead>
          <tbody>{rows.map(({ co, st }, i) => { const w = who(co, ROLE_OF[st]); const ck = itemsOf(tpl, p, st).filter((c) => c.level === 'req'); const rf = reqFields(co, st);
            return <tr key={co + st}><td>{i + 1}</td><td>{COMPANY[co]}</td><td><b>{STATUS[st]}</b></td><td>{w.names}</td><td>{w.sla}h</td><td>{ck.map((c) => c.label).join(' · ') || '—'}</td><td>{[...(BLOCK[p + '.' + st] ?? []), ...(rf.length ? ['Thiếu: ' + rf.join(', ')] : [])].join(' · ') || '—'}</td></tr>; })}
            {p !== 'QT0' && <tr><td>{rows.length + 1}</td><td>Ngoài hệ thống</td><td><b>{FINAL[p]}</b></td><td>Ký tay → {(() => { const fc = (cp.find((x) => x.proc === p && x.role === 'hoan_tat')?.company ?? 'HW') as Company; return COMPANY[fc] + ': ' + who(fc, 'hoan_tat').names; })()} hoàn tất</td><td>—</td><td>—</td><td>Chưa tải bản đã ký</td></tr>}</tbody></table></div>
      </section>

      <section className="card pd-form"><h2>Biểu mẫu · {PHIEU[p]}</h2>
        <div className="pd-fgrid">
          <div><div className="gd-h">Thông tin đầu phiếu</div><ul className="pd-fl">{fieldsOf(p, 'header').map((f) => <li key={f.key}>{f.label}</li>)}</ul>
            {fieldsOf(p, 'file').length > 0 && <><div className="gd-h" style={{ marginTop: 10 }}>File đính kèm</div><ul className="pd-fl">{fieldsOf(p, 'file').map((f) => <li key={f.key}>{f.label}</li>)}</ul></>}</div>
          {tablesOf(p).map((t) => <div key={t.key}><div className="gd-h">Bảng · {t.title}</div><ul className="pd-fl cols">{colsOf(p, t.key).map((c) => <li key={c.k}>{c.t}{c.calc && <small> (tự tính)</small>}</li>)}</ul></div>)}
        </div>
        <p className="small muted">Sửa trường ở Quản trị → Trường dữ liệu · checklist ở Quản trị → Checklist · hướng dẫn ở Quản trị → Hướng dẫn bước · người ở Quản trị → Phụ trách quy trình.</p>
      </section>
    </div>);
}
