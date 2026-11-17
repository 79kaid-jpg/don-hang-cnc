import { useEffect, useState } from 'react';
import { sb, type Profile } from '../lib/supabase';
import { Icon } from './Icon';
import { confirmDialog, toast } from './ui';

type E = { id: number; at: string; user_id: string | null; real_user: string | null; kind: string; message: string; detail: string | null; url: string | null; ua: string | null };
const KIND: Record<string, string> = { thao_tac: 'Thao tác', js: 'Lỗi giao diện', promise: 'Lỗi ngầm' };

/** Quản trị → Nhật ký lỗi (chỉ Admin IT) */
export function ErrorsAdmin({ people }: { people: Profile[] }) {
  const [rows, setRows] = useState<E[] | null>(null); const [q, setQ] = useState(''); const [open, setOpen] = useState<number | null>(null);
  const load = () => sb.from('app_errors').select('*').order('at', { ascending: false }).limit(300).then(({ data }) => setRows((data as E[]) ?? []));
  useEffect(() => { load(); }, []);
  const nm = (id: string | null) => (id ? people.find((p) => p.id === id)?.full_name ?? id.slice(0, 8) : '—');
  const shown = (rows ?? []).filter((r) => !q || (r.message + ' ' + (r.url ?? '') + ' ' + nm(r.user_id)).toLowerCase().includes(q.toLowerCase()));
  return <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <label className="search" style={{ flex: 1 }}><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nội dung lỗi, người dùng, đường dẫn…" aria-label="Tìm lỗi" /></label>
      <button className="btn sm" onClick={load}>Tải lại</button>
      <button className="btn sm danger-soft" onClick={async () => { if (!(await confirmDialog('Xoá toàn bộ nhật ký lỗi?', 'Xoá', true))) return; const { error } = await sb.from('app_errors').delete().gt('id', 0); if (error) toast(error.message); else { toast('Đã xoá'); load(); } }}>Xoá hết</button>
    </div>
    <p className="small muted" style={{ margin: 0 }}>Lỗi khi thao tác (máy chủ từ chối) và lỗi giao diện của mọi người dùng. Tự xoá sau 90 ngày.</p>
    {!rows ? <p className="muted">Đang tải…</p> : shown.length === 0 ? <p className="muted">Không có lỗi.</p> :
      <ul className="err-l">{shown.map((r) => <li key={r.id}>
        <button type="button" className="err-h" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
          <span className={'chip sm ' + (r.kind === 'thao_tac' ? 'warn' : 'bad')}>{KIND[r.kind] ?? r.kind}</span>
          <span className="err-m">{r.message}</span>
          <span className="small muted err-w">{nm(r.user_id)}{r.real_user && r.real_user !== r.user_id ? ' (do ' + nm(r.real_user) + ' làm thay)' : ''} · {new Date(r.at).toLocaleString('vi-VN')}</span></button>
        {open === r.id && <div className="err-d">
          {r.url && <div><b>Trang:</b> <a href={r.url} target="_blank" rel="noreferrer">{r.url.replace(/^https?:\/\/[^/]+/, '')}</a></div>}
          {r.detail && <pre>{r.detail}</pre>}
          {r.ua && <div className="small muted">{r.ua}</div>}</div>}
      </li>)}</ul>}
  </section>;
}
