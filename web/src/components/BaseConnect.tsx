import { useEffect, useState } from 'react';
import { sb, errText } from '../lib/supabase';
import { dt } from '../lib/format';
import { Icon } from './Icon';
import { confirmDialog, toast } from './ui';

/** Kết nối & khoá API: lưu ở máy chủ (app_secrets), không hiện lại; giữ bản trước để khôi phục; kiểm tra bằng edge function */
type Row = { name: string; label: string | null; provider: string | null; note: string | null; is_set: boolean; hint: string; updated_at: string | null; updated_by: string | null;
  has_prev: boolean; prev_updated_at: string | null; last_test_at: string | null; last_test_ok: boolean | null; last_test_msg: string | null };
type Preset = { name: string; label: string; provider: string; help: string; link?: string };
const PRESETS: Preset[] = [
  { name: 'BASE_TOKEN', label: 'Base Workflow', provider: 'base', help: 'Token v2 – account.base.vn → Tích hợp với bên thứ ba ver 2. Dùng tạo nhiệm vụ trên workflow.base.vn.' },
  { name: 'BASE_REQUEST_TOKEN', label: 'Base Request', provider: 'base', help: 'Token v2 có quyền app Request. Để trống thì dùng token Workflow.' },
  { name: 'ZALO_BOT_TOKEN', label: 'Zalo Bot', provider: 'zalo', help: 'Token bot Zalo dùng gửi thông báo duyệt.' },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude)', provider: 'anthropic', help: 'Khoá dạng sk-ant-… tạo ở console.anthropic.com → API keys.', link: 'https://console.anthropic.com/settings/keys' },
  { name: 'GOOGLE_API_KEY', label: 'Google API', provider: 'google', help: 'API key tạo ở Google Cloud Console / AI Studio. Kiểm tra bằng Gemini API.', link: 'https://aistudio.google.com/app/apikey' },
  { name: 'OPENAI_API_KEY', label: 'OpenAI', provider: 'openai', help: 'Khoá sk-… tạo ở platform.openai.com.' },
];
const PROV: Record<string, string> = { base: 'Base.vn', zalo: 'Zalo', anthropic: 'Anthropic', google: 'Google', openai: 'OpenAI', other: 'Khác' };

export function BaseConnect({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null); const [adding, setAdding] = useState(false);
  const load = () => sb.rpc('integration_status').then(({ data, error }) => { if (error) toast(errText(error)); setRows((data as Row[]) ?? []); });
  useEffect(() => { load(); }, []);
  const all: (Row | (Preset & { missing: true }))[] = [...(rows ?? []),
    ...PRESETS.filter((p) => !(rows ?? []).some((r) => r.name === p.name)).map((p) => ({ ...p, missing: true as const }))];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card ig-intro"><Icon name="shield" size={20} /><div>
        <b>Khoá API chỉ lưu ở máy chủ</b>
        <p className="small muted" style={{ margin: '2px 0 0' }}>Không hiện lại sau khi lưu, không nằm trong mã nguồn hay trình duyệt. Thay khoá mới vẫn giữ <b>bản trước</b> để khôi phục nếu dán nhầm. Chỉ Admin IT xem và sửa.</p></div>
        {canEdit && <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => setAdding(true)}><Icon name="plus" size={15} />Thêm khoá</button>}</div>
      {!rows ? <div className="card muted">Đang tải…</div> : <div className="ig-grid">{all.map((r) => <Slot key={r.name} r={r} canEdit={canEdit} onChanged={load} />)}</div>}
      {adding && <AddKey onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </div>);
}

function Slot({ r, canEdit, onChanged }: { r: Row | (Preset & { missing: true }); canEdit: boolean; onChanged: () => void }) {
  const preset = PRESETS.find((p) => p.name === r.name); const missing = 'missing' in r;
  const row = missing ? null : (r as Row);
  const [tok, setTok] = useState(''); const [show, setShow] = useState(false); const [busy, setBusy] = useState(''); const [open, setOpen] = useState(false);
  const label = row?.label ?? preset?.label ?? r.name; const provider = row?.provider ?? preset?.provider ?? 'other';
  const save = async () => { setBusy('save');
    const { error } = await sb.rpc('set_integration_secret', { p_name: r.name, p_value: tok, p_label: label, p_provider: provider, p_note: null });
    setBusy(''); if (error) return toast(errText(error)); setTok(''); setOpen(false); toast('Đã lưu ' + label + ' – đang kiểm tra…'); onChanged(); test(); };
  const test = async () => { setBusy('test');
    const { data, error } = await sb.functions.invoke('integration-test', { body: { name: r.name } }); setBusy('');
    const d = data as { ok?: boolean; msg?: string; error?: string } | null;
    if (error || d?.error) toast(d?.error ?? errText(error!)); else toast((d?.ok ? '' : 'Lỗi: ') + d?.msg); onChanged(); };
  const restore = async () => { if (!(await confirmDialog(`Khôi phục khoá ${label} về bản trước (lưu lúc ${dt(row!.prev_updated_at)})? Khoá hiện tại sẽ thành bản trước.`, 'Khôi phục'))) return;
    const { error } = await sb.rpc('integration_restore', { p_name: r.name }); if (error) return toast(errText(error)); toast('Đã khôi phục'); onChanged(); test(); };
  const remove = async () => { if (!(await confirmDialog(`Xoá khoá ${label}? Các chức năng dùng khoá này sẽ ngừng hoạt động.`, 'Xoá khoá', true))) return;
    const { error } = await sb.rpc('integration_remove', { p_name: r.name }); if (error) return toast(errText(error)); toast('Đã xoá ' + label); onChanged(); };
  const st = !row ? 'off' : row.last_test_ok === true ? 'ok' : row.last_test_ok === false ? 'bad' : 'unk';
  return (
    <section className={'card ig ' + st}>
      <div className="ig-h">
        <span className={'ig-logo p-' + provider} aria-hidden="true">{(PROV[provider] ?? label).slice(0, 1)}</span>
        <div style={{ flex: 1, minWidth: 0 }}><b>{label}</b><div className="small muted mono">{r.name}</div></div>
        <span className={'ig-st ' + st}>{st === 'ok' ? '● Hoạt động' : st === 'bad' ? '● Lỗi' : st === 'unk' ? '● Chưa kiểm tra' : 'Chưa cài'}</span>
      </div>
      {row ? <div className="ig-meta small">
        <span>Khoá <b className="mono">{row.hint}</b></span>
        <span>Cập nhật {dt(row.updated_at)}{row.updated_by ? ' · ' + row.updated_by : ''}</span>
        {row.last_test_msg && <span className={st === 'bad' ? 'ig-err' : ''}>{row.last_test_msg} <span className="muted">· {dt(row.last_test_at)}</span></span>}
      </div> : <p className="small muted" style={{ margin: 0 }}>{preset?.help}</p>}
      {canEdit && (open || missing ? <div className="ig-edit">
        {row && preset && <p className="small muted" style={{ margin: 0 }}>{preset.help}</p>}
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <input type={show ? 'text' : 'password'} value={tok} onChange={(e) => setTok(e.target.value)} autoComplete="off" spellCheck={false} className="mono" placeholder={row ? 'Dán khoá mới (khoá cũ được giữ làm bản trước)' : 'Dán khoá ở đây'} aria-label={'Khoá ' + label} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn icon-btn" type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn' : 'Hiện'}><Icon name={show ? 'eyeoff' : 'eye'} size={16} /></button>
          <button className="btn primary" disabled={!!busy || tok.trim().length < 8} onClick={save}>{busy === 'save' ? 'Đang lưu…' : 'Lưu'}</button>
          {row && <button className="btn" onClick={() => { setOpen(false); setTok(''); }}>Huỷ</button>}
        </div>
        {preset?.link && <a className="small" href={preset.link} target="_blank" rel="noreferrer">Lấy khoá ở đâu? →</a>}
      </div> : <div className="ig-acts">
        <button className="btn xs" disabled={!!busy} onClick={test}><Icon name="refresh" size={13} />{busy === 'test' ? 'Đang kiểm tra…' : 'Kiểm tra'}</button>
        <button className="btn xs" onClick={() => setOpen(true)}><Icon name="clip" size={13} />Thay khoá</button>
        {row?.has_prev && <button className="btn xs" onClick={restore} title={'Bản trước lưu lúc ' + dt(row.prev_updated_at)}><Icon name="back" size={13} />Khôi phục bản trước</button>}
        <button className="btn xs icon-only danger-soft" aria-label={'Xoá ' + label} onClick={remove}><Icon name="trash" size={13} /></button>
      </div>)}
    </section>);
}

function AddKey({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(''); const [label, setLabel] = useState(''); const [provider, setProvider] = useState('other'); const [val, setVal] = useState('');
  const go = async () => { const { error } = await sb.rpc('set_integration_secret', { p_name: name, p_value: val, p_label: label || name, p_provider: provider, p_note: null });
    if (error) return toast(errText(error)); toast('Đã thêm ' + (label || name)); onDone(); };
  return (
    <div className="modal-bg" onClick={onClose}><div className="modal mv" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="mv-head"><h2 style={{ margin: 0 }}>Thêm khoá API</h2><button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
      <label className="f">Dịch vụ<select value={provider} onChange={(e) => setProvider(e.target.value)}>{Object.entries(PROV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="f">Tên hiển thị<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="VD: Google Drive service" /></label>
      <label className="f">Tên khoá (chữ in hoa, số, _)<input className="mono" value={name} onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} placeholder="VD: GOOGLE_DRIVE_KEY" /></label>
      <label className="f">Giá trị<input className="mono" type="password" autoComplete="off" value={val} onChange={(e) => setVal(e.target.value)} /></label>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Huỷ</button><button className="btn primary" disabled={name.length < 3 || val.trim().length < 4} onClick={go}>Lưu khoá</button></div>
    </div></div>);
}
