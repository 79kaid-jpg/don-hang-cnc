import { useEffect, useState } from 'react';
import { toast } from '../components/ui';

/** Admin: bật "Hiện biến" để thấy mã biến mẫu in {…} cạnh từng ô (nhớ theo máy) */
const KEY = 'pms.showVars';
let on = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
const subs = new Set<(v: boolean) => void>();
export function setShowVars(v: boolean) { on = v; try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* bỏ qua */ } subs.forEach((f) => f(v)); }
export function useShowVars() {
  const [v, set] = useState(on);
  useEffect(() => { subs.add(set); set(on); return () => { subs.delete(set); }; }, []);
  return v;
}
/** Nhãn biến nhỏ màu nhạt, bấm để chép */
export function VarTag({ k, sum }: { k: string; sum?: string }) {
  const v = useShowVars(); if (!v || !k) return null;
  const cp = (e: React.MouseEvent, x: string) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard?.writeText('{' + x + '}'); toast('Đã chép {' + x + '}'); };
  return <span className="vtag-w">
    <button type="button" className="vtag" title="Bấm để chép biến mẫu in" onClick={(e) => cp(e, k)}>{'{' + k + '}'}</button>
    {sum && <button type="button" className="vtag" title="Biến tổng cột – bấm để chép" onClick={(e) => cp(e, sum)}>{'Σ{' + sum + '}'}</button>}</span>;
}
