import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb, type Profile } from './supabase';
import { setCaUser } from './qcache';

/** me = người dùng hiệu lực (người được đóng vai nếu IT đang "đăng nhập với tư cách"); real = người thật đang đăng nhập */
type Ctx = { session: Session | null; me: Profile | null; real: Profile | null; acting: boolean; actUntil: string | null; grants: { target_id: string | null; to_at: string }[];
  can: (r: string) => boolean; reload: () => Promise<void>; actAs: (id: string) => Promise<string | null>; stopActing: () => Promise<void> };
const AuthCtx = createContext<Ctx>({ session: null, me: null, real: null, acting: false, actUntil: null, grants: [], can: () => false,
  reload: async () => {}, actAs: async () => null, stopActing: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [real, setReal] = useState<Profile | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [actUntil, setActUntil] = useState<string | null>(null); const [grants, setGrants] = useState<{ target_id: string | null; to_at: string }[]>([]);
  const load = async (s: Session | null) => {
    setSession(s);
    if (s) {
      const { data } = await sb.from('profiles').select('*').eq('id', s.user.id).single();
      const r = data as Profile; setReal(r);
      const nowIso = new Date().toISOString();
      const { data: g } = await sb.from('act_grants').select('target_id, to_at').eq('admin_id', s.user.id).is('revoked_at', null).lte('from_at', nowIso).gte('to_at', nowIso);
      const gl = (g as { target_id: string | null; to_at: string }[]) ?? []; setGrants(gl);
      const ok = r?.impersonating && (r.roles.includes('admin_it') || gl.some((x) => !x.target_id || x.target_id === r.impersonating));
      if (ok) {
        const { data: t } = await sb.from('profiles').select('*').eq('id', r.impersonating).single();
        setMe((t as Profile) ?? r);
        const { data: st } = await sb.rpc('act_status'); setActUntil((st as { until?: string } | null)?.until ?? null);
      } else { setMe(r); setActUntil(null); }
    } else { setReal(null); setMe(null); }
    setReady(true);
  };
  useEffect(() => {
    // Không gọi Supabase trực tiếp trong callback auth (supabase-js sẽ treo) → đẩy ra setTimeout
    const { data } = sb.auth.onAuthStateChange((_e, s) => { setTimeout(() => load(s), 0); });
    return () => data.subscription.unsubscribe();
  }, []);
  const can = (r: string) => !!me && me.active && (me.roles.includes(r) || me.roles.includes('admin_it'));
  const acting = !!real && !!me && real.id !== me.id;
  setCaUser((me?.id ?? '') + (actUntil ? '+' : ''));
  const actAs = async (id: string) => {
    const { error } = await sb.rpc('start_impersonation', { p_user: id });
    if (error) return error.message;
    await load(session); return null;
  };
  const stopActing = async () => { await sb.rpc('stop_impersonation'); await load(session); };
  // Hết hạn uỷ quyền → tự thoát làm thay
  useEffect(() => { if (!actUntil) return; const ms = new Date(actUntil).getTime() - Date.now(); if (ms > 2 ** 31 - 1) return;
    const t = setTimeout(async () => { await sb.rpc('stop_impersonation'); location.reload(); }, Math.max(0, ms)); return () => clearTimeout(t); }, [actUntil]);
  // Màn hình chờ (index.html) giữ đến khi biết trạng thái đăng nhập, rồi mờ dần
  useEffect(() => { if (!ready) return; const el = document.getElementById('splash'); if (!el) return;
    const t0 = (window as unknown as { __t0?: number }).__t0 ?? 0; const wait = Math.max(0, 450 - (performance.now() - t0));
    const a = setTimeout(() => el.classList.add('out'), wait); const z = setTimeout(() => el.remove(), wait + 400); return () => { clearTimeout(a); clearTimeout(z); }; }, [ready]);
  if (!ready) return null;
  return <AuthCtx.Provider value={{ session, me, real, acting, actUntil, grants, can, reload: () => load(session), actAs, stopActing }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
