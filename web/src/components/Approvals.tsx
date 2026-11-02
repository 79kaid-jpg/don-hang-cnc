import { useState } from 'react';
import { sb, errText, type Approval, type Profile } from '../lib/supabase';
import { dt } from '../lib/format';
import { Msg } from './ui';

const STATE: Record<string, [string, string]> = { dat: ['done', 'Đạt'], cho: ['wait', 'Đang chờ'], tu_choi: ['bad', 'Từ chối'], huy: ['idle', 'Huỷ'] };

/** Chuỗi duyệt của một phiếu (lượt mới nhất) + nút Duyệt/Từ chối cho đúng người */
export function ApprovalChain({ rows, people, meId, onDone, steps }: {
  rows: Approval[]; people: Record<string, Profile>; meId: string; onDone: () => void;
  steps: { step_no: number; label: string; approver_id: string | null }[];
}) {
  const round = Math.max(0, ...rows.map((r) => r.round));
  const cur = rows.filter((r) => r.round === round);
  const mine = cur.find((r) => r.status === 'cho' && r.approver_id === meId);
  return (
    <div className="steps">
      {steps.map((s) => {
        const a = cur.find((r) => r.step_no === s.step_no);
        const [k, t] = a ? STATE[a.status] : ['idle', 'Chưa tới'];
        const who = people[a?.approver_id ?? s.approver_id ?? '']?.full_name ?? '[chưa gán người]';
        return (
          <div className="step" key={s.step_no}>
            <span className={'dot ' + k}>{s.step_no}</span>
            <span style={{ flex: 1 }}><b>{who}</b><br /><span className="small muted">{s.label}{a?.note ? ' · ' + a.note : ''}</span></span>
            <span className="small muted">{a?.decided_at ? dt(a.decided_at) : a?.due_at ? 'hạn ' + dt(a.due_at) : ''}</span>
            <span className={'chip ' + k}>{t}</span>
          </div>
        );
      })}
      {mine && <Decide id={mine.id} onDone={onDone} />}
    </div>
  );
}

export function Decide({ id, onDone }: { id: string; onDone: () => void }) {
  const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const act = async (ok: boolean) => {
    setBusy(true); setErr('');
    const { error } = await sb.rpc('decide_approval', { p_approval: id, p_ok: ok, p_note: note || null });
    setBusy(false); if (error) setErr(errText(error)); else onDone();
  };
  return (
    <div className="card" style={{ background: 'var(--soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label className="f">Ghi chú / lý do (bắt buộc khi từ chối)<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <Msg err={err} />
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => act(true)}>Duyệt</button>
        <button className="btn danger" disabled={busy} onClick={() => act(false)}>Từ chối</button>
      </div>
    </div>
  );
}
