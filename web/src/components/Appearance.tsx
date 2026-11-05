import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/** Giao diện: sáng / tối / theo máy + cỡ chữ (lưu trên máy này) */
type Th = 'light' | 'dark' | 'auto'; type Fs = 'md' | 'lg';
const get = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
export function applyAppearance() {
  const th = get('ui-theme', 'light') as Th; const fs = get('ui-fs', 'md') as Fs;
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.documentElement.dataset.fs = fs;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#1b1813' : '#E4ECF5');
}
export function Appearance() {
  const [th, setTh] = useState<Th>(get('ui-theme', 'light') as Th); const [fs, setFs] = useState<Fs>(get('ui-fs', 'md') as Fs);
  useEffect(() => { try { localStorage.setItem('ui-theme', th); localStorage.setItem('ui-fs', fs); } catch { /* */ } applyAppearance(); }, [th, fs]);
  return (
    <div className="appear">
      <div className="seg" role="group" aria-label="Chế độ màu">
        {([['light', 'Sáng', 'sun'], ['dark', 'Tối', 'moon'], ['auto', 'Theo máy', 'settings']] as const).map(([k, t, ic]) =>
          <button key={k} type="button" aria-pressed={th === k} onClick={() => setTh(k)}><Icon name={ic} size={15} />{t}</button>)}
      </div>
      <div className="seg" role="group" aria-label="Cỡ chữ">
        <button type="button" aria-pressed={fs === 'md'} onClick={() => setFs('md')}>Aa Vừa</button>
        <button type="button" aria-pressed={fs === 'lg'} onClick={() => setFs('lg')} style={{ fontSize: 17 }}>Aa Lớn</button>
      </div>
    </div>);
}
