import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Skeleton } from '../components/ui';
const Production = lazy(() => import('./Production'));
const Dashboard = lazy(() => import('./Dashboard'));

/** Thống kê: Sản lượng (chính) · Hiệu quả quy trình (phụ) */
export default function Stats() {
  const [sp, setSp] = useSearchParams(); const v = sp.get('v') === 'qt' ? 'qt' : 'sl';
  return <>
    <div className="st-tabs" role="tablist" aria-label="Thống kê">
      <button role="tab" aria-selected={v === 'sl'} onClick={() => setSp({}, { replace: true })}>Sản lượng</button>
      <button role="tab" aria-selected={v === 'qt'} onClick={() => setSp({ v: 'qt' }, { replace: true })}>Hiệu quả quy trình</button>
    </div>
    <Suspense fallback={<Skeleton rows={4} h={140} />}>{v === 'sl' ? <Production /> : <Dashboard />}</Suspense>
  </>;
}
