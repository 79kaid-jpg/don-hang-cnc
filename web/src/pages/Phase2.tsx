import { useCallback, useEffect, useState } from 'react';
import { sb, errText, type Approval, type Order, type Profile } from '../lib/supabase';
import { date, dt, money, num } from '../lib/format';
import { Chip } from '../components/ui';
import { Icon } from '../components/Icon';
import { ApprovalChain } from '../components/Approvals';

type Step = { doc_type: string; step_no: number; label: string; approver_id: string | null };
type Common = {
  o: Order; can: (r: string) => boolean; load: () => void; setErr: (s: string) => void; setOk: (s: string) => void;
  run: (fn: string, a: Record<string, unknown>, m: string) => Promise<void>;
  appr: Approval[]; steps: Step[]; people: Record<string, Profile>; meId: string;
};
type Row = Record<string, any>; // eslint-disable-line

function useRows(o: Order, tables: string[]) {
  const [d, setD] = useState<Record<string, Row[]>>({});
  const reload = useCallback(async () => {
    const res = await Promise.all(tables.map((t) => sb.from(t).select('*').eq('order_id', o.id)));
    setD(Object.fromEntries(tables.map((t, i) => [t, (res[i].data as Row[]) ?? []])));
  }, [o]); // eslint-disable-line — o đổi sau mỗi lần tải lại đơn → nạp lại phiếu
  useEffect(() => { reload(); }, [reload]);
  return [d, reload] as const;
}

const Box = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div className="row between"><h3>{title}</h3>{right}</div>{children}
  </div>);

function Chain(p: Common & { doc: string }) {
  const rows = p.appr.filter((a) => a.doc_type === p.doc);
  const st = p.steps.filter((s) => s.doc_type === p.doc);
  if (!rows.length) return null;
  return <ApprovalChain rows={rows} steps={st} people={p.people} meId={p.meId} onDone={() => { p.setOk('Đã ghi kết quả duyệt.'); p.load(); }} />;
}

const numIn = (v: unknown) => (v == null ? '' : String(v));
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

/* ───────────── QT2: F3 dự toán → PO → F4 nhập kho ───────────── */
export function QT2(p: Common & { part?: 'f3' | 'buy' }) {
  const { o, can, run, setErr, setOk, load, part } = p;
  const [d, reload] = useRows(o, ['material_plans', 'material_plan_lines', 'purchase_orders', 'receipts', 'receipt_lines']);
  const plan = d.material_plans?.[0]; const ml = d.material_plan_lines ?? [];
  const po = d.purchase_orders?.[0]; const rl = d.receipt_lines ?? []; const rc = d.receipts?.[0];
  const [waste, setWaste] = useState(''); const [poF, setPoF] = useState<Row>({}); const [recv, setRecv] = useState<Record<string, Row>>({});
  const [note, setNote] = useState('');
  useEffect(() => { setWaste(numIn(plan?.waste_pct ?? 3)); }, [plan?.waste_pct]);
  useEffect(() => { setPoF(po ?? {}); }, [po]);
  const after = () => { reload(); load(); };
  if (o.nvl_status === 'chua_bat_dau') return <div className="card muted">Nhánh NVL mở khi đơn hoàn tất QT1 (ĐK2).</div>;
  const s = o.nvl_status;
  const buyTotal = ml.reduce((a, l) => a + Number(l.buy_kg), 0);

  const savePO = async () => {
    const { error } = await sb.from('purchase_orders').update({ po_no: poF.po_no ?? '', supplier: poF.supplier ?? '', eta: poF.eta || null,
      unit_price: Number(poF.unit_price || 0), note: poF.note ?? '' }).eq('order_id', o.id);
    if (error) setErr(errText(error)); else { setOk('Đã lưu PO.'); after(); }
  };
  const saveRecv = async () => {
    for (const l of rl) {
      const r = recv[l.id]; if (!r) continue;
      const { error } = await sb.from('receipt_lines').update({ received_kg: toNum(numIn(r.received_kg)), bad_kg: toNum(numIn(r.bad_kg)) ?? 0 }).eq('id', l.id);
      if (error) { setErr(errText(error)); return; }
    }
    setRecv({}); setOk('Đã lưu số thực nhận.'); after();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {part !== 'buy' && <Box title="B1 · Dự toán NVL (F3)" right={<Chip s={['du_toan', 'cho_duyet_f3'].includes(s) ? 'wait' : 'dat'} text={s === 'du_toan' ? 'Đang lập' : s === 'cho_duyet_f3' ? 'Duyệt cùng LGC' : 'Đã duyệt'} />}>
        {ml.length === 0 ? <p className="muted">Chưa lập dự toán. Bấm "Tính dự toán" để lấy khối lượng từ F1, cộng hao hụt và trừ tồn kho.</p> : (
          <div className="scroll"><table className="tbl" style={{ minWidth: 600 }}>
            <thead><tr><th>Vật liệu</th><th className="n">Dày</th><th className="n">F1 (kg)</th><th className="n">Cần (kg)</th><th className="n">Tồn kho</th><th className="n">Cần mua</th></tr></thead>
            <tbody>{ml.map((l) => <tr key={l.id}><td>{l.material}</td><td className="n">{num(l.thickness_mm, 2)}</td><td className="n">{num(l.f1_kg, 1)}</td>
              <td className="n">{num(l.need_kg, 1)}</td><td className="n">{num(l.stock_kg, 1)}</td><td className="n"><b>{num(l.buy_kg, 1)}</b></td></tr>)}
              <tr style={{ fontWeight: 700 }}><td colSpan={5}>Tổng cần mua</td><td className="n">{num(buyTotal, 1)} kg</td></tr></tbody>
          </table></div>)}
        {s === 'du_toan' && o.gc_status === 'lap_lgc' && (can('ke_hoach') || can('admin_cnc')) && (
          <div className="row">
            <label className="f" style={{ width: 140 }}>Hao hụt (%)<input inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} /></label>
            <button className="btn" onClick={() => run('f3_build', { p_order: o.id, p_waste: toNum(waste) }, 'Đã tính dự toán.').then(reload)}>Tính dự toán</button>
            <span className="small muted">Dự toán được Dung duyệt cùng LGC ở B2.</span>
          </div>)}
      </Box>}

      {part !== 'f3' && ['mua_hang', 'cho_duyet_po', 'nhap_kho', 'san_sang'].includes(s) && (o.gc_status !== 'lap_lgc') && (buyTotal > 0 || po?.po_no) && (
        <Box title="B3 · Mua NVL (PO)" right={<Chip s={s === 'mua_hang' ? 'wait' : s === 'cho_duyet_po' ? 'wait' : 'dat'} text={s === 'mua_hang' ? 'Đang lập' : s === 'cho_duyet_po' ? 'Chờ duyệt' : 'Đã duyệt'} />}>
          {!po ? <div className="msg info">Giá mua không hiển thị với vai trò của bạn.</div> : (
            <div className="grid2">
              {([['po_no', 'Số PO'], ['supplier', 'Nhà cung cấp'], ['eta', 'Ngày hàng về'], ['unit_price', 'Đơn giá (đ/kg)']] as const).map(([k, t]) => (
                <label className="f" key={k}>{t}<input type={k === 'eta' ? 'date' : 'text'} inputMode={k === 'unit_price' ? 'numeric' : undefined}
                  disabled={!(s === 'mua_hang' && can('mua_hang'))} value={numIn(poF[k])} onChange={(e) => setPoF({ ...poF, [k]: e.target.value })} /></label>))}
              <div><div className="small muted">Thành tiền dự kiến</div><b>{money(buyTotal * Number(poF.unit_price || 0))}</b></div>
            </div>)}
          {s === 'mua_hang' && can('mua_hang') && (
            <div className="row">
              {buyTotal > 0 ? <>
                <button className="btn" onClick={savePO}>Lưu PO</button>
                <button className="btn primary" onClick={() => run('submit_for_approval', { p_order: o.id, p_doc: 'PO' }, 'Đã gửi duyệt PO.')}>Gửi duyệt PO</button>
              </> : null}
            </div>)}
          <Chain {...p} doc="PO" />
        </Box>)}

      {part !== 'f3' && (['nhap_kho', 'san_sang'].includes(s) || rc) && rl.length > 0 && (
        <Box title="B4 · Nhập kho & QC NVL (F4)" right={<Chip s={rc?.qc_result ?? 'chua'} text={{ chua: 'Chưa QC', dat: 'Đạt', khong_dat: 'Không đạt' }[(rc?.qc_result ?? 'chua') as 'chua']} />}>
          <div className="scroll"><table className="tbl" style={{ minWidth: 620 }}>
            <thead><tr><th>Vật liệu</th><th className="n">Dày</th><th className="n">Theo PO (kg)</th><th className="n">Thực nhận</th><th className="n">Lỗi (kg)</th><th className="n">Chênh</th></tr></thead>
            <tbody>{rl.map((l) => {
              const ed = s === 'nhap_kho' && can('kho_qc'); const r = recv[l.id] ?? {};
              return <tr key={l.id}><td>{l.material}</td><td className="n">{num(l.thickness_mm, 2)}</td><td className="n">{num(l.expected_kg, 1)}</td>
                <td className="n">{ed ? <input inputMode="decimal" aria-label="Thực nhận" style={{ textAlign: 'right' }} value={numIn(r.received_kg ?? l.received_kg)} onChange={(e) => setRecv({ ...recv, [l.id]: { ...r, received_kg: e.target.value } })} /> : num(l.received_kg, 1)}</td>
                <td className="n">{ed ? <input inputMode="decimal" aria-label="Lỗi" style={{ textAlign: 'right' }} value={numIn(r.bad_kg ?? l.bad_kg)} onChange={(e) => setRecv({ ...recv, [l.id]: { ...r, bad_kg: e.target.value } })} /> : num(l.bad_kg, 1)}</td>
                <td className={'n' + (l.received_kg != null && Number(l.diff_kg) < 0 ? ' kb-late' : '')}>{l.received_kg == null ? '' : num(l.diff_kg, 1)}</td></tr>;
            })}</tbody>
          </table></div>
          {s === 'nhap_kho' && can('kho_qc') && (<>
            <label className="f">Ghi chú QC (bắt buộc nếu thiếu / lỗi – sẽ lập F7)<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="row">
              <button className="btn" onClick={saveRecv}>Lưu số thực nhận</button>
              <button className="btn primary" onClick={() => run('f4_submit', { p_order: o.id, p_ok: true, p_note: note }, 'Đã chốt nhập kho.')}>QC đạt, nhập kho</button>
              <button className="btn danger" onClick={() => run('f4_submit', { p_order: o.id, p_ok: false, p_note: note }, 'Đã lập F7, quay lại mua bổ sung.')}>QC không đạt</button>
            </div></>)}
          {rc?.qc_note && <p className="small muted">QC: {rc.qc_note}</p>}
        </Box>)}
      {part !== 'f3' && s === 'san_sang' && <div className="msg ok"><Icon name="check" size={18} />NVL đã sẵn sàng trong kho.</div>}
    </div>
  );
}

/* ───────────── QT3: F5 LGC → F6 bàn giao → QC thành phẩm ───────────── */
export function QT3(p: Common & { part?: 'lgc' | 'approve' | 'after' }) {
  const { o, can, run, setErr, setOk, load, part } = p;
  const [d, reload] = useRows(o, ['work_orders', 'work_order_lines', 'handovers', 'handover_lines', 'qc_finished']);
  const wo = d.work_orders?.[0]; const wl = d.work_order_lines ?? []; const ho = d.handovers?.[0]; const hl = d.handover_lines ?? []; const qc = d.qc_finished?.[0];
  const [reserve, setReserve] = useState(''); const [woF, setWoF] = useState<Row>({}); const [hoF, setHoF] = useState<Row>({});
  const [act, setAct] = useState<Record<string, string>>({}); const [note, setNote] = useState(''); const [qcNote, setQcNote] = useState(''); const [pallets, setPallets] = useState('');
  const [pdf, setPdf] = useState<string | null>(null);
  useEffect(() => { setReserve(numIn(wo?.reserve_pct ?? 3)); setWoF(wo ?? {}); }, [wo]);
  useEffect(() => { setHoF(ho ?? {});
    if (ho?.signed_pdf_path) sb.storage.from('files').createSignedUrl(ho.signed_pdf_path, 3600).then(({ data }) => setPdf(data?.signedUrl ?? null)); }, [ho]);
  const after = () => { reload(); load(); };
  if (o.gc_status === 'chua_bat_dau') return <div className="card muted">Nhánh gia công mở khi đơn hoàn tất QT1 (ĐK2).</div>;
  const g = o.gc_status;
  const saveWO = async () => {
    const { error } = await sb.from('work_orders').update({ start_date: woF.start_date || null, finish_date: woF.finish_date || null, wh_to: woF.wh_to ?? '', note: woF.note ?? '' }).eq('order_id', o.id);
    if (error) setErr(errText(error)); else { setOk('Đã lưu LGC.'); after(); }
  };
  const saveHO = async () => {
    for (const l of hl) if (act[l.id] !== undefined) {
      const { error } = await sb.from('handover_lines').update({ actual_kg: toNum(act[l.id]) }).eq('id', l.id);
      if (error) { setErr(errText(error)); return; }
    }
    const { error } = await sb.from('handovers').update({ delivered_by: hoF.delivered_by ?? '', received_by: hoF.received_by ?? '' }).eq('order_id', o.id);
    if (error) setErr(errText(error)); else { setAct({}); setOk('Đã lưu bàn giao.'); after(); }
  };
  const upPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const path = `${o.id}/f6/${Date.now()}-${f.name}`;
    const up = await sb.storage.from('files').upload(path, f); if (up.error) { setErr(errText(up.error)); return; }
    const { error } = await sb.from('handovers').update({ signed_pdf_path: path }).eq('order_id', o.id);
    if (error) setErr(errText(error)); else { setOk('Đã tải biên bản F6.'); after(); }
  };
  const lgcLabel: Record<string, string> = { lap_lgc: 'Đang lập', cho_duyet_lgc: 'Chờ duyệt 4 cấp', cho_nvl: 'Đã duyệt · chờ NVL' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {part !== 'approve' && part !== 'after' && <Box title={'B1 · Lệnh gia công (F5)' + (wo?.code ? ' ' + wo.code : '')} right={<Chip s={lgcLabel[g] ? (g === 'cho_nvl' ? 'wait' : g) : 'dat'} text={lgcLabel[g] ?? 'Đã duyệt'} />}>
        {wl.length === 0 ? <p className="muted">Chưa lập LGC. Bấm "Tính LGC" để lấy khối lượng từ F1 cộng dự phòng.</p> : (
          <div className="scroll"><table className="tbl" style={{ minWidth: 520 }}>
            <thead><tr><th>Vật liệu</th><th className="n">Dày</th><th className="n">Số tấm</th><th className="n">F1 (kg)</th><th className="n">Cấp phát (kg)</th></tr></thead>
            <tbody>{wl.map((l) => <tr key={l.id}><td>{l.material}</td><td className="n">{num(l.thickness_mm, 2)}</td><td className="n">{l.qty}</td><td className="n">{num(l.f1_kg, 1)}</td><td className="n"><b>{num(l.issue_kg, 1)}</b></td></tr>)}</tbody>
          </table></div>)}
        {wo && <div className="grid2">
          {([['start_date', 'Ngày bắt đầu'], ['finish_date', 'Ngày hoàn thành']] as const).map(([k, t]) => (
            <label className="f" key={k}>{t}<input type="date" disabled={!(g === 'lap_lgc' && can('admin_cnc'))} value={numIn(woF[k])} onChange={(e) => setWoF({ ...woF, [k]: e.target.value })} /></label>))}
          <label className="f">Xưởng nhận<input disabled={!(g === 'lap_lgc' && can('admin_cnc'))} value={numIn(woF.wh_to)} onChange={(e) => setWoF({ ...woF, wh_to: e.target.value })} /></label>
          <div><div className="small muted">Từ kho</div><b>{wo.wh_from}</b></div>
        </div>}
        {g === 'lap_lgc' && can('admin_cnc') && (
          <div className="row">
            <label className="f" style={{ width: 140 }}>Dự phòng (%)<input inputMode="decimal" value={reserve} onChange={(e) => setReserve(e.target.value)} /></label>
            <button className="btn" onClick={() => run('f5_build', { p_order: o.id, p_reserve: toNum(reserve) }, 'Đã tính LGC.').then(reload)}>Tính LGC</button>
            {wo && <button className="btn" onClick={saveWO}>Lưu ngày</button>}
          </div>)}
      </Box>}

      {part !== 'lgc' && part !== 'after' && wl.length > 0 && (
        <Box title="B2 · Duyệt LGC 4 cấp (kèm dự toán NVL)" right={<Chip s={g === 'lap_lgc' ? 'idle' : g === 'cho_duyet_lgc' ? 'wait' : 'dat'} text={g === 'lap_lgc' ? 'Chưa gửi' : g === 'cho_duyet_lgc' ? 'Đang duyệt' : 'Đã duyệt'} />}>
          <p className="small muted" style={{ margin: 0 }}>Anh Mai kiểm tra → Dung duyệt (cả dự toán NVL) → Thủy kiểm tra → Anh Kiên duyệt. Duyệt xong: cần mua NVL thì sang B3, tồn kho đủ thì sang thẳng B5.</p>
          {g === 'lap_lgc' && can('admin_cnc') && <div className="row">
            <button className="btn primary" onClick={() => run('submit_for_approval', { p_order: o.id, p_doc: 'F5' }, 'Đã gửi duyệt LGC 4 cấp.')}>Gửi duyệt LGC + dự toán NVL</button></div>}
          <Chain {...p} doc="F5" />
          {g === 'cho_nvl' && <div className="msg info">LGC đã duyệt. Đang chờ NVL (B3–B4) để bàn giao (ĐK3).</div>}
        </Box>)}

      {part !== 'lgc' && part !== 'approve' && hl.length > 0 && (
        <Box title="B5 · Bàn giao NVL (F6)" right={<Chip s={g === 'ban_giao' ? 'wait' : 'dat'} text={g === 'ban_giao' ? 'Đang bàn giao' : 'Đã bàn giao ' + date(ho?.done_at)} />}>
          <div className="scroll"><table className="tbl" style={{ minWidth: 520 }}>
            <thead><tr><th>Vật liệu</th><th className="n">Dày</th><th className="n">Theo LGC (kg)</th><th className="n">Thực giao</th><th className="n">Chênh</th></tr></thead>
            <tbody>{hl.map((l) => <tr key={l.id}><td>{l.material}</td><td className="n">{num(l.thickness_mm, 2)}</td><td className="n">{num(l.planned_kg, 1)}</td>
              <td className="n">{g === 'ban_giao' && can('admin_cnc') ? <input inputMode="decimal" aria-label="Thực giao" style={{ textAlign: 'right' }} value={act[l.id] ?? numIn(l.actual_kg)} onChange={(e) => setAct({ ...act, [l.id]: e.target.value })} /> : num(l.actual_kg, 1)}</td>
              <td className={'n' + (l.actual_kg != null && Number(l.diff_kg) !== 0 ? ' kb-late' : '')}>{l.actual_kg == null ? '' : num(l.diff_kg, 1)}</td></tr>)}</tbody>
          </table></div>
          <div className="grid2">
            <label className="f">Bên giao (Kho IPC)<input disabled={g !== 'ban_giao'} value={numIn(hoF.delivered_by)} onChange={(e) => setHoF({ ...hoF, delivered_by: e.target.value })} /></label>
            <label className="f">Bên nhận (Xưởng)<input disabled={g !== 'ban_giao'} value={numIn(hoF.received_by)} onChange={(e) => setHoF({ ...hoF, received_by: e.target.value })} /></label>
            <div><div className="small muted">Biên bản F6 đã ký</div>{pdf ? <a className="btn sm" href={pdf} target="_blank" rel="noopener"><Icon name="file" size={16} />Mở PDF</a> : <span className="muted">Chưa có</span>}</div>
          </div>
          {g === 'ban_giao' && can('admin_cnc') && (<>
            <label className="f">Lý do chênh lệch (nếu có – sẽ lập F7)<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <div className="row">
              <button className="btn" onClick={saveHO}>Lưu bàn giao</button>
              <label className="btn ghost"><Icon name="upload" size={18} />Tải biên bản ký<input type="file" accept="application/pdf,image/*" onChange={upPdf} style={{ display: 'none' }} /></label>
              <button className="btn primary" onClick={() => run('f6_submit', { p_order: o.id, p_note: note }, 'Đã bàn giao NVL – xưởng bắt đầu gia công.')}>Chốt bàn giao</button>
            </div></>)}
        </Box>)}

      {part !== 'lgc' && part !== 'approve' && ['gia_cong', 'qc_dat'].includes(g) && (
        <Box title="B6 · Gia công & QC thành phẩm" right={<Chip s={qc?.result ?? 'chua'} text={{ chua: 'Đang gia công', dat: 'Đạt', khong_dat: 'Không đạt' }[(qc?.result ?? 'chua') as 'chua']} />}>
          {qc?.result === 'dat' ? <p>Đạt · {qc.pallets} pallet · {dt(qc.checked_at)} {qc.note}</p> : (can('kho_qc') || can('admin_cnc')) && (<>
            <div className="grid2">
              <label className="f">Số pallet<input inputMode="numeric" value={pallets} onChange={(e) => setPallets(e.target.value.replace(/\D/g, ''))} /></label>
              <label className="f">Ghi chú / lỗi (bắt buộc nếu không đạt)<input value={qcNote} onChange={(e) => setQcNote(e.target.value)} /></label>
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => run('qc_tp_submit', { p_order: o.id, p_ok: true, p_pallets: Number(pallets || 0), p_note: qcNote }, 'ĐK5 đạt – chuyển giao hàng.')}>QC đạt</button>
              <button className="btn danger" onClick={() => run('qc_tp_submit', { p_order: o.id, p_ok: false, p_pallets: null, p_note: qcNote }, 'Đã lập F7.')}>Không đạt</button>
            </div></>)}
        </Box>)}
    </div>
  );
}

/* ───────────── F7 phát sinh ───────────── */
const KIND: Record<string, string> = { sai_lech_nvl: 'Sai lệch NVL', loi_nvl: 'Lỗi NVL', loi_gia_cong: 'Lỗi gia công', khach_doi: 'Khách đổi', khac: 'Khác' };
export function F7({ o, can, run, people }: Common) {
  const [rows, setRows] = useState<Row[]>([]); const [act, setAct] = useState<Record<string, string>>({});
  const reload = useCallback(() => { sb.from('issues').select('*').eq('order_id', o.id).order('created_at', { ascending: false }).then(({ data }) => setRows((data as Row[]) ?? [])); }, [o.id]);
  useEffect(() => { reload(); }, [reload, o]);
  const may = can('admin_cnc') || can('kho_qc') || can('mua_hang') || can('ke_hoach');
  return (
    <Box title="F7 · Phát sinh">
      {rows.length === 0 && <p className="muted">Không có phát sinh. Phiếu F7 tự lập khi F4 thiếu/lỗi, F6 chênh lệch hoặc QC thành phẩm không đạt.</p>}
      {rows.map((i) => (
        <div key={i.id} className="card" style={{ background: 'var(--soft)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row between"><b>{KIND[i.kind]} · từ {i.source}</b>
            <Chip s={i.status === 'mo' ? 'wait' : i.status === 'da_xu_ly' ? 'dat' : 'bad'} text={{ mo: 'Đang mở', da_xu_ly: 'Đã xử lý', chuyen_cap_tren: 'Chuyển cấp trên' }[i.status as 'mo']} /></div>
          <div>{i.description}</div>
          <div className="small muted">{dt(i.created_at)} · {people[i.created_by]?.full_name ?? ''}{i.action ? ' · Xử lý: ' + i.action : ''}</div>
          {i.status === 'mo' && may && (
            <div className="row">
              <input style={{ flex: '1 1 220px' }} placeholder="Hướng xử lý" aria-label="Hướng xử lý" value={act[i.id] ?? ''} onChange={(e) => setAct({ ...act, [i.id]: e.target.value })} />
              <button className="btn primary sm" onClick={() => run('f7_close', { p_issue: i.id, p_status: 'da_xu_ly', p_action: act[i.id] ?? '' }, 'Đã đóng F7.').then(reload)}>Đã xử lý</button>
              <button className="btn sm" onClick={() => run('f7_close', { p_issue: i.id, p_status: 'chuyen_cap_tren', p_action: act[i.id] ?? '' }, 'Đã chuyển cấp trên.').then(reload)}>Chuyển cấp trên</button>
            </div>)}
        </div>))}
    </Box>
  );
}

/* QT2 gộp: B1 LGC + dự toán → B2 duyệt → B3 PO → B4 F4 → ĐK3 → B5 F6 → B6 QC TP */
export function QT2Merged(p: Common) {
  if (p.o.gc_status === 'chua_bat_dau') return <div className="card muted">QT2 mở khi đơn hoàn tất QT1 (ĐK2: khách đã ký XNĐH).</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <QT3 {...p} part="lgc" />
      <QT2 {...p} part="f3" />
      <QT3 {...p} part="approve" />
      <QT2 {...p} part="buy" />
      <QT3 {...p} part="after" />
    </div>);
}
