import { useEffect, useState, type ReactNode } from 'react';
import { chipKind } from '../lib/format';
import { Icon } from './Icon';

const ICON: Record<string, string> = { done: 'check', bad: 'alert', wait: 'clock', idle: '' };
/** Nhãn trạng thái: màu + icon + chữ (không chỉ dựa vào màu) */
export const Chip = ({ s, text }: { s: string; text?: string }) => {
  const k = chipKind(s);
  return <span className={'chip ' + k}>{ICON[k] && <Icon name={ICON[k]} size={13} />}{text ?? s}</span>;
};

// ── Toast: báo thành công, tự ẩn sau 4s, đọc qua aria-live, không chiếm focus ──
type T = { id: number; text: string };
let push: (t: string) => void = () => {};
export const toast = (t: string) => push(t);
export function Toaster() {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => {
    push = (text) => { const id = Date.now() + Math.random(); setList((l) => [...l, { id, text }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4000); };
  }, []);
  return (
    <div className="toaster" aria-live="polite" role="status">
      {list.map((t) => <div key={t.id} className="toast"><Icon name="check" size={18} />{t.text}</div>)}
    </div>
  );
}

/** Lỗi hiện tại chỗ (role=alert); thông báo thành công chuyển sang toast */
export const Msg = ({ err, ok }: { err?: string; ok?: string }) => {
  useEffect(() => { if (ok) toast(ok); }, [ok]);
  return err ? <div className="msg err" role="alert"><Icon name="alert" size={18} /><span>{err}</span></div> : null;
};

// ── Hộp xác nhận cho thao tác khó hoàn tác ──
let ask: (q: string, label?: string, safe?: boolean) => Promise<boolean> = async () => true;
/** safe=true: thao tác bình thường (nút vàng); mặc định: thao tác khó hoàn tác (nút đỏ) */
export const confirmDialog = (q: string, label = 'Xác nhận', safe = false) => ask(q, label, safe);
export function ConfirmHost() {
  const [st, setSt] = useState<{ q: string; d: string; safe: boolean; res: (v: boolean) => void } | null>(null);
  useEffect(() => { ask = (q, d = 'Xác nhận', safe = false) => new Promise((res) => setSt({ q, d, safe, res })); }, []);
  if (!st) return null;
  const done = (v: boolean) => { st.res(v); setSt(null); };
  return (
    <div className="modal-bg" onClick={() => done(false)}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-q" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && done(false)}>
        <p id="cf-q" style={{ margin: 0, fontWeight: 600 }}>{st.q}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" autoFocus onClick={() => done(false)}>Huỷ</button>
          <button className={st.safe ? 'btn primary' : 'btn danger-fill'} onClick={() => done(true)}>{st.d}</button>
        </div>
      </div>
    </div>
  );
}

export const Skeleton = ({ rows = 3, h = 56 }: { rows?: number; h?: number }) => (
  <div className="steps" aria-busy="true" aria-label="Đang tải">{Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>
);

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="empty"><Icon name="inbox" size={28} /><b>{title}</b>{children}</div>
);
