import { useEffect, useState } from 'react';
import { sb, errText } from '../lib/supabase';
import { dt } from '../lib/format';
import { Icon } from './Icon';

/** Kết nối BASE: Admin IT dán token, lưu thẳng vào kho bí mật ở máy chủ (app_secrets). Không hiện lại token. */
type St = { name: string; is_set: boolean; updated_at: string | null; hint: string | null };
export function BaseConnect({ canEdit }: { canEdit: boolean }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <TokenSlot canEdit={canEdit} name="BASE_TOKEN" title="Base Workflow" desc="Dùng tạo / cập nhật nhiệm vụ trên workflow.base.vn." />
    <TokenSlot canEdit={canEdit} name="BASE_REQUEST_TOKEN" title="Base Request" desc="Dùng tạo phiếu trên request.base.vn. Để trống thì dùng token Workflow." />
  </div>;
}
function TokenSlot({ canEdit, name, title, desc }: { canEdit: boolean; name: string; title: string; desc: string }) {
  const [st, setSt] = useState<St[]>([]); const [tok, setTok] = useState(''); const [show, setShow] = useState(false);
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => sb.rpc('integration_status').then(({ data }) => setSt((data as St[]) ?? []));
  useEffect(() => { load(); }, []);
  const t = st.find((x) => x.name === name);
  const save = async () => {
    setErr(''); setOk(''); setBusy(true);
    const { error } = await sb.rpc('set_integration_secret', { p_name: name, p_value: tok });
    setBusy(false);
    if (error) setErr(errText(error)); else { setTok(''); setOk('Đã lưu token vào máy chủ.'); load(); }
  };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row" style={{ gap: 10 }}><b style={{ fontSize: 17 }}>Kết nối {title}</b>
        {t?.is_set ? <span className="chip done"><Icon name="check" size={13} />Đã có token {t.hint} · {dt(t.updated_at)}</span> : <span className="chip wait">Chưa có token</span>}</div>
      <p className="small muted" style={{ margin: 0 }}>{desc} Dán API token (v2) tạo ở account.base.vn → Tích hợp với bên thứ ba ver 2. Token được lưu ở máy chủ, không hiện lại, không nằm trong mã nguồn. Dán token mới chỉ thay token của ô này.</p>
      {canEdit ? (<>
        <div className="row">
          <label className="f" style={{ flex: '1 1 300px' }}>API token
            <input type={show ? 'text' : 'password'} value={tok} onChange={(e) => setTok(e.target.value)} autoComplete="off" spellCheck={false} className="mono" placeholder="Dán token ở đây" /></label>
          <button className="btn icon-btn" type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn' : 'Hiện'}><Icon name={show ? 'eyeoff' : 'eye'} size={18} /></button>
          <button className="btn primary" disabled={busy || tok.trim().length < 10} onClick={save}><Icon name="check" size={16} />{busy ? 'Đang lưu…' : 'Lưu token'}</button>
        </div>
        {err && <div className="msg err">{err}</div>}{ok && <div className="msg ok"><Icon name="check" size={16} /><span>{ok}</span></div>}
      </>) : <div className="msg info"><Icon name="alert" size={18} /><span>Chỉ Admin IT được cài kết nối.</span></div>}
    </div>);
}
