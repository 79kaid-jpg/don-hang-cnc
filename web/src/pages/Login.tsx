import { useState } from 'react';
import { sb } from '../lib/supabase';
import { Msg } from '../components/ui';
export default function Login() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) setErr('Sai email hoặc mật khẩu.'); setBusy(false);
  };
  return (
    <form className="card login" onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row"><div className="logo" aria-hidden="true">C</div><h1>Đơn hàng CNC</h1></div>
      <p className="muted" style={{ margin: 0 }}>Tài khoản do IT cấp.</p>
      <label className="f">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
      <label className="f">Mật khẩu<input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></label>
      <Msg err={err} />
      <button className="btn primary" disabled={busy}>Đăng nhập</button>
    </form>
  );
}
