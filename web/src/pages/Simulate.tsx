import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sb, type Profile } from '../lib/supabase';
import { COMPANY, FINAL, FLOW, PROC_NAME, ROLE_OF, STATUS, type Proc } from '../lib/proc';
import { Icon } from '../components/Icon';

type Lane = 'PN' | 'IPC' | 'HW' | 'KH';
type Step = { id: string; proc: Proc; lane: Lane; title: string; who: string; sla?: number; say: string; kind: 'start' | 'work' | 'check' | 'approve' | 'extra' | 'back' | 'hand' | 'final' | 'done' };
const LANES: [Lane, string][] = [['PN', 'Phương Nam CNC'], ['IPC', 'IPC'], ['HW', 'Hanwha'], ['KH', 'Khách hàng']];
const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
const FORM: Record<Proc, string> = { QT0: 'Danh sách tấm (bóc tách)', QT1: 'Xác nhận đơn hàng (XNĐH)', QT2: 'Lệnh gia công', QT3: 'Phiếu xuất kho / BB giao hàng' };
const ICON: Record<Step['kind'], string> = { start: 'plus', work: 'file', check: 'eye', approve: 'check', extra: 'shield', back: 'back', hand: 'arrow', final: 'print', done: 'star' };
const SPEEDS = [0.5, 1, 2];

type CP = { proc: string; company: string; role: string; user_id: string | null; group_id: string | null; sla_h: number | null };
type LV = { proc: string; company: string; name: string; user_id: string | null; group_id: string | null; sla_h: number; active: boolean };

export default function Simulate() {
  const [cp, setCp] = useState<CP[]>([]); const [lv, setLv] = useState<LV[]>([]); const [ppl, setPpl] = useState<Record<string, string>>({}); const [gs, setGs] = useState<Record<string, string>>({});
  const [i, setI] = useState(0); const [play, setPlay] = useState(false); const [sp, setSp] = useState(1);
  const [withBack, setBack] = useState(true); const [withExtra, setExtra] = useState(true);
  useEffect(() => { Promise.all([sb.from('chain_people').select('proc, company, role, user_id, group_id, sla_h'), sb.from('approval_levels').select('proc, company, name, user_id, group_id, sla_h, active').order('ord'),
    sb.from('profiles').select('id, full_name'), sb.from('work_groups').select('id, name')]).then(([a, b, c, d]) => {
    setCp((a.data as CP[]) ?? []); setLv((b.data as LV[]) ?? []);
    setPpl(Object.fromEntries(((c.data as Profile[]) ?? []).map((p) => [p.id, p.full_name]))); setGs(Object.fromEntries(((d.data as { id: string; name: string }[]) ?? []).map((g) => [g.id, g.name]))); }); }, []);

  const steps = useMemo(() => {
    const nm = (u: string | null, g: string | null) => (u ? ppl[u] ?? '…' : g ? 'Nhóm ' + (gs[g] ?? '') : 'Chưa gán');
    const S: Step[] = [{ id: 's', proc: 'QT0', lane: 'PN', kind: 'start', title: 'Kinh doanh tạo đơn hàng', who: 'Kinh doanh', say: 'Khách gửi yêu cầu qua Email / điện thoại. Kinh doanh tạo đơn: khách hàng, dự án, hạn báo giá, hạn giao. Hệ thống mở QT0 cho Phương Nam.' }];
    for (const proc of PROCS) {
      const cos: Lane[] = proc === 'QT0' ? ['PN'] : ['PN', 'IPC', 'HW'];
      for (const co of cos) {
        for (const st of FLOW[proc]) {
          const role = ROLE_OF[st]; const c = cp.find((x) => x.proc === proc && x.company === co && x.role === role);
          const kind: Step['kind'] = st === 'kiem_tra' ? 'check' : st === 'duyet' ? 'approve' : 'work';
          const say = proc === 'QT0'
            ? { tiep_nhan: 'Admin nhận bản vẽ, kiểm tra đủ hồ sơ rồi chuyển cho kỹ thuật.', boc_tach: 'Kỹ thuật bóc tách bản vẽ: vật liệu, độ dày, kích thước từng tấm.', tao_ds: 'Admin nhập danh sách tấm vào phiếu (bảng, file đính kèm).', kiem_tra: 'Người kiểm tra soát lại danh sách. Sai → trả về kèm lý do.', duyet: 'Người duyệt xác nhận bóc tách. Dữ liệu được chép sang QT1 làm cơ sở báo giá.' }[st]!
            : st === 'lap' ? `${COMPANY[co as 'PN']} lập phiếu ${FORM[proc]}${co === 'PN' ? '' : ' – dữ liệu đã được chép sẵn từ công ty trước, chỉ cần chỉnh giá / số lượng của mình'}.`
            : st === 'kiem_tra' ? 'Kiểm tra nội dung phiếu và ghi chú của đơn. Đạt → gửi duyệt; sai → trả về người lập kèm lý do.'
            : 'Người duyệt đọc thông tin phiếu và ghi chú rồi duyệt hoặc trả về. Duyệt xong phiếu được khoá.';
          S.push({ id: `${proc}.${co}.${st}`, proc, lane: co, kind, title: STATUS[st], who: nm(c?.user_id ?? null, c?.group_id ?? null), sla: c?.sla_h ?? 48, say });
          if (withBack && proc === 'QT1' && co === 'IPC' && st === 'kiem_tra') {
            S.push({ id: 'back', proc, lane: co, kind: 'back', title: 'Trả về', who: nm(c?.user_id ?? null, c?.group_id ?? null), say: 'Tình huống: người kiểm tra thấy sai đơn giá → bấm Trả về, ghi lý do. Phiếu quay lại bước Lập, lý do hiện trong Hành trình duyệt.' });
            const l = cp.find((x) => x.proc === proc && x.company === co && x.role === 'lap');
            S.push({ id: 'relap', proc, lane: co, kind: 'work', title: 'Lập lại', who: nm(l?.user_id ?? null, l?.group_id ?? null), sla: l?.sla_h ?? 48, say: 'Người lập sửa theo lý do rồi gửi kiểm tra lại. Thời gian chờ được tính tiếp vào hiệu quả của từng người.' });
            S.push({ id: 'recheck', proc, lane: co, kind: 'check', title: 'Kiểm tra lại', who: nm(c?.user_id ?? null, c?.group_id ?? null), sla: c?.sla_h ?? 48, say: 'Lần này đạt → gửi duyệt.' });
          }
        }
        if (withExtra) for (const l of lv.filter((x) => x.active && x.proc === proc && x.company === co))
          S.push({ id: `${proc}.${co}.x.${l.name}`, proc, lane: co, kind: 'extra', title: l.name, who: nm(l.user_id, l.group_id), sla: l.sla_h, say: `Cấp duyệt thêm (cấu hình ở Luồng duyệt). ${l.name} xem phiếu và ghi chú rồi duyệt hoặc trả về.` });
        if (proc !== 'QT0' && co !== 'HW') S.push({ id: `${proc}.${co}.hand`, proc, lane: co === 'PN' ? 'IPC' : 'HW', kind: 'hand', title: 'Nhận phiếu', who: 'Hệ thống', say: `${COMPANY[co as 'PN']} đã duyệt → hệ thống tự tạo phiếu cho ${co === 'PN' ? 'IPC' : 'Hanwha'} và báo Zalo cho người lập.` });
      }
      if (proc !== 'QT0') S.push({ id: `${proc}.final`, proc, lane: 'KH', kind: 'final', title: FINAL[proc], who: 'Khách hàng', say: `Cả 3 công ty đã duyệt. Bấm "In mẫu cho khách ký" → in theo mẫu Excel, khách ký tay, chụp / scan rồi "Tải bản đã ký". ${proc === 'QT3' ? '' : 'Quy trình kế tiếp được mở.'}` });
    }
    S.push({ id: 'done', proc: 'QT3', lane: 'KH', kind: 'done', title: 'Đơn hoàn tất', who: '', say: 'Toàn bộ QT0 → QT3 đã xong. Thời gian từng bước được ghi lại cho Thống kê và Hiệu quả.' });
    return S;
  }, [cp, lv, ppl, gs, withBack, withExtra]);

  useEffect(() => { setI((x) => Math.min(x, steps.length - 1)); }, [steps.length]);
  useEffect(() => { if (!play) return; if (i >= steps.length - 1) { setPlay(false); return; } const t = setTimeout(() => setI(i + 1), 2600 / sp); return () => clearTimeout(t); }, [play, i, sp, steps.length]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement).closest('input,select,textarea')) return;
    if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1)); else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); else if (e.key === ' ') { e.preventDefault(); setPlay((p) => !p); } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [steps.length]);

  // token chạy theo bước hiện tại
  const wrap = useRef<HTMLDivElement>(null); const [tok, setTok] = useState<{ x: number; y: number } | null>(null);
  const cur = steps[i];
  useLayoutEffect(() => { const w = wrap.current; const el = w?.querySelector(`[data-s="${CSS.escape(cur?.id ?? '')}"]`) as HTMLElement | null; if (!w || !el) return;
    const a = w.getBoundingClientRect(), b = el.getBoundingClientRect(); setTok({ x: b.left - a.left + w.scrollLeft + b.width / 2, y: b.top - a.top + b.height / 2 });
    const sx = b.left - a.left + w.scrollLeft - a.width / 2 + b.width / 2; w.scrollTo({ left: sx, behavior: 'smooth' }); }, [cur?.id, steps]);

  const nextSt = steps[i + 1];
  return (
    <div className="sim">
      <header className="sim-top">
        <div><h1>Mô phỏng quy trình đơn hàng</h1></div>
        <div className="sim-opts">
          <button className="sim-tg" aria-pressed={withBack} onClick={() => setBack(!withBack)}><Icon name="back" size={13} />Trả về</button>
          <button className="sim-tg" aria-pressed={withExtra} onClick={() => setExtra(!withExtra)}><Icon name="shield" size={13} />Duyệt thêm</button>
        </div>
      </header>

      <div className="sim-board" ref={wrap}>
        <div className="sim-grid" style={{ gridTemplateColumns: `112px repeat(${PROCS.length}, minmax(240px, 1fr))` }}>
          <div className="sim-corner" />
          {PROCS.map((p) => <div key={p} className={'sim-ph' + (cur?.proc === p ? ' on' : '')}><b>{p}</b><span>{PROC_NAME[p]}</span></div>)}
          {LANES.map(([ln, lab]) => <div key={ln} style={{ display: 'contents' }}>
            <div className={'sim-lh' + (cur?.lane === ln ? ' on' : '')}>{lab}</div>
            {PROCS.map((p) => <div key={p} className={'sim-cell' + (cur?.proc === p && cur?.lane === ln ? ' on' : '')}>
              {steps.map((s, k) => s.proc === p && s.lane === ln && <button key={s.id} data-s={s.id} onClick={() => { setI(k); setPlay(false); }}
                className={'sim-chip ' + s.kind + (k < i ? ' past' : k === i ? ' now' : '')} title={s.title + (s.who ? ' · ' + s.who : '')}>
                <Icon name={k < i ? 'check' : ICON[s.kind]} size={12} /><span>{s.title}</span></button>)}
            </div>)}
          </div>)}
        </div>
        {tok && <div className="sim-tok" style={{ transform: `translate(${tok.x}px, ${tok.y}px)`, transitionDuration: 700 / sp + 'ms' }}><Icon name="file" size={14} /></div>}
      </div>

      {cur && <section className={'sim-card ' + cur.kind} key={cur.id}>
        <div className="sim-ic"><Icon name={ICON[cur.kind]} size={22} /></div>
        <div className="sim-body">
          <div className="sim-meta"><span className="sim-qt">{cur.proc}</span>{cur.lane !== 'KH' ? COMPANY[cur.lane as 'PN'] : 'Khách hàng'}{cur.kind !== 'start' && cur.kind !== 'done' && cur.proc !== 'QT0' && <> · {FORM[cur.proc]}</>}
            <span className="sim-n">Bước {i + 1}/{steps.length}</span></div>
          <h2>{cur.title}</h2>
          {cur.who && <div className="sim-who"><span className="sim-av">{cur.who.trim().split(' ').pop()?.[0] ?? '?'}</span><b>{cur.who}</b>{cur.sla && <span className="small muted">· hạn xử lý {cur.sla}h</span>}</div>}
          <p>{cur.say}</p>
          {nextSt && <div className="small muted sim-next"><Icon name="arrow" size={12} /> Tiếp theo: <b>{nextSt.title}</b>{nextSt.lane !== 'KH' ? ' · ' + COMPANY[nextSt.lane as 'PN'] : ''}</div>}
        </div>
      </section>}

      <div className="sim-ctl" role="toolbar" aria-label="Điều khiển mô phỏng">
        <button className="sim-b" aria-label="Về đầu" title="Về đầu" onClick={() => { setI(0); setPlay(false); }}><Svg d="M6 5v14M18 6l-8 6 8 6z" /></button>
        <button className="sim-b" aria-label="Bước trước" title="Bước trước" disabled={i === 0} onClick={() => setI(i - 1)}><Svg d="m15 6-6 6 6 6" /></button>
        <button className="sim-b play" aria-label={play ? 'Tạm dừng' : 'Chạy'} title={play ? 'Tạm dừng' : 'Chạy'} onClick={() => { if (i >= steps.length - 1) setI(0); setPlay(!play); }}>
          {play ? <Svg d="M9 6v12M15 6v12" /> : <Svg d="M8 5.5v13l10.5-6.5z" fill />}</button>
        <button className="sim-b" aria-label="Bước sau" title="Bước sau" disabled={i >= steps.length - 1} onClick={() => setI(i + 1)}><Svg d="m9 6 6 6-6 6" /></button>
        <button className="sim-b sp" aria-label={'Tốc độ ' + sp + '×'} title="Đổi tốc độ" onClick={() => setSp(SPEEDS[(SPEEDS.indexOf(sp) + 1) % SPEEDS.length])}>{sp}×</button>
      </div>
      <div className="sim-bar"><i style={{ width: ((i + 1) / steps.length) * 100 + '%' }} /></div>
      <p className="small muted sim-keys" style={{ textAlign: 'center' }}>Phím ← → để chuyển bước · Space để chạy / dừng · bấm vào ô bất kỳ để nhảy tới</p>
    </div>
  );
}

function Svg({ d, fill }: { d: string; fill?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
