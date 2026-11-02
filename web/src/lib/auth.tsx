import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb, type Profile } from './supabase';

type Ctx = { session: Session | null; me: Profile | null; can: (r: string) => boolean; reload: () => void };
const AuthCtx = createContext<Ctx>({ session: null, me: null, can: () => false, reload: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const load = async (s: Session | null) => {
    setSession(s);
    if (s) { const { data } = await sb.from('profiles').select('*').eq('id', s.user.id).single(); setMe(data as Profile); }
    else setMe(null);
    setReady(true);
  };
  useEffect(() => {
    // Không gọi Supabase trực tiếp trong callback auth (supabase-js sẽ treo) → đẩy ra setTimeout
    const { data } = sb.auth.onAuthStateChange((_e, s) => { setTimeout(() => load(s), 0); });
    return () => data.subscription.unsubscribe();
  }, []);
  const can = (r: string) => !!me && me.active && (me.roles.includes(r) || me.roles.includes('admin_it'));
  if (!ready) return <p style={{ padding: 24 }}>Đang tải…</p>;
  return <AuthCtx.Provider value={{ session, me, can, reload: () => load(session) }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
