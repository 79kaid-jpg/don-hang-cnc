import { useState } from 'react';
import { sb } from '../lib/supabase';
import { Msg } from '../components/ui';
import { Icon } from '../components/Icon';
export default function Login() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [show, setShow] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) setErr('Email hoặc mật khẩu chưa đúng. Kiểm tra lại, hoặc nhờ IT đặt lại mật khẩu.'); setBusy(false);
  };
  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={go} noValidate>
        <div className="row"><img className="logo" src="./icon.svg" alt="" aria-hidden="true" /><div><h1 style={{ fontSize: 22 }}>PMS</h1><div className="small muted">CNC → IPC → Hanwha</div></div></div>
        <label className="f">Email
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" />
        </label>
        <label className="f">Mật khẩu
          <span className="pw">
            <input type={show ? 'text' : 'password'} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={show}>
              <Icon name={show ? 'eyeoff' : 'eye'} /></button>
          </span>
        </label>
        <Msg err={err} />
        <button className="btn primary" disabled={busy || !email || !pw}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        <p className="small muted" style={{ margin: 0 }}>Tài khoản do IT cấp. Quên mật khẩu: liên hệ IT.</p>
      </form>
    </div>
  );
}
