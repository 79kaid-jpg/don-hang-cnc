import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/** Giao diện: sáng / tối / theo máy + cỡ chữ (lưu trên máy này) */
type Th = 'light' | 'dark' | 'auto'; type Fs = 'md' | 'lg';
const get = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
export function applyAppearance() {
  const th = get('ui-theme', 'light') as Th; const fs = get('ui-fs', 'md') as Fs;
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.documentElement.dataset.fs = fs;
  document.documentElement.dataset.glass = get('ui-glass', 'off');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#1b1813' : '#E4ECF5');
}
export function Appearance() {
  const [th, setTh] = useState<Th>(get('ui-theme', 'light') as Th); const [fs, setFs] = useState<Fs>(get('ui-fs', 'md') as Fs); const [gl, setGl] = useState(get('ui-glass', 'off'));
  useEffect(() => { try { localStorage.setItem('ui-theme', th); localStorage.setItem('ui-fs', fs); localStorage.setItem('ui-glass', gl); } catch { /* */ } applyAppearance(); }, [th, fs, gl]);
  return (
    <div className="appear">
      <div className="ap-row"><span className="ap-lb">Màu</span>
        <div className="ap-seg" role="radiogroup" aria-label="Chế độ màu">
          {([['light', 'Sáng', 'sun'], ['dark', 'Tối', 'moon'], ['auto', 'Tự động', 'settings']] as const).map(([k, t, ic]) =>
            <button key={k} type="button" role="radio" aria-checked={th === k} title={k === 'auto' ? 'Theo cài đặt của máy' : t} onClick={() => setTh(k)}><Icon name={ic} size={15} /><span>{t}</span></button>)}
        </div></div>
      <div className="ap-row"><span className="ap-lb">Kiểu</span>
        <div className="ap-seg" role="radiogroup" aria-label="Kiểu giao diện">
          <button type="button" role="radio" aria-checked={gl !== 'on'} title="Giao diện mặc định" onClick={() => setGl('off')}><Icon name="panel" size={15} /><span>Mặc định</span></button>
          <button type="button" role="radio" aria-checked={gl === 'on'} title="Khung kính mờ (chế độ sáng)" onClick={() => setGl('on')}><Icon name="star" size={15} /><span>Kính</span></button>
        </div></div>
      <div className="ap-row"><span className="ap-lb">Cỡ chữ</span>
        <div className="ap-seg" role="radiogroup" aria-label="Cỡ chữ">
          <button type="button" role="radio" aria-checked={fs === 'md'} title="Chữ vừa" onClick={() => setFs('md')}><span className="ap-a1">A</span><span>Vừa</span></button>
          <button type="button" role="radio" aria-checked={fs === 'lg'} title="Chữ lớn" onClick={() => setFs('lg')}><span className="ap-a2">A</span><span>Lớn</span></button>
        </div></div>
    </div>);
}
