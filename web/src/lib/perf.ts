import { useEffect, useState } from 'react';
import { sb, type Profile } from './supabase';
import { stepOf, ROLE_OF, type Batch, type Doc } from './proc';

/** Cấu hình điểm hiệu quả & thưởng – Admin IT chỉnh trong Quản trị → Hiệu quả & thưởng */
export type Prize = { label: string; weight: number; color: string; icon?: string; points?: number };
export type PerfCfg = {
  period_days: number; sla_h: number;
  w_ontime: number; w_speed: number; w_quality: number; w_volume: number;
  volume_cap: number; overdue_penalty: number; min_steps: number;
  crown_ontime: number; crown_min_steps: number;
  pts_ontime: number; pts_late: number; pts_fast: number; fast_h: number; pts_returned: number;
  spin_cost: number; prizes: Prize[]; wheel_on?: boolean; points_spin?: boolean;
  tk_on?: boolean; tk_min_steps?: number; tk_min_ontime?: number; tk_base?: number; tk_clean_bonus?: number; tk_top_n?: number; tk_top_bonus?: number; tk_max_day?: number; tk_valid_days?: number;
};
export const DEFAULT_CFG: PerfCfg = {
  period_days: 30, sla_h: 48, w_ontime: 40, w_speed: 25, w_quality: 20, w_volume: 15, volume_cap: 1.5, overdue_penalty: 5, min_steps: 5,
  crown_ontime: 90, crown_min_steps: 10, pts_ontime: 10, pts_late: 2, pts_fast: 5, fast_h: 8, pts_returned: -5, spin_cost: 50, prizes: [], wheel_on: true, points_spin: true, tk_on: true, tk_min_steps: 3, tk_min_ontime: 90, tk_base: 1, tk_clean_bonus: 1, tk_top_n: 3, tk_top_bonus: 1, tk_max_day: 3, tk_valid_days: 14
};

type D = Doc & { signs: { role: string; user: string; at: string; action: string }[]; created_at: string };
type CP = { proc: string; company: string; role: string; user_id: string | null; group_id: string | null };
export type Score = {
  id: string; name: string; unit: string; steps: number; ontime: number; avgH: number; roleAvgH: number; quality: number; returned: number;
  overdue: number; sOntime: number; sSpeed: number; sQuality: number; sVolume: number; score: number; ranked: boolean;
  rank: number; rankCo: number; nCo: number; crown: boolean; crownWhy: string[]; prev: number | null; weekly: number[];
};
export const UNIT_NAME: Record<string, string> = { CNC: 'Phương Nam CNC', IPC: 'IPC', HANWA: 'Hanwa', IT: 'IT', KHAC: 'Khác' };

/** Tải dữ liệu một lần, tính điểm cho mọi người theo cấu hình */
export function usePerf() {
  const [st, setSt] = useState<{ cfg: PerfCfg; people: Profile[]; bs: Batch[]; ds: D[]; cp: CP[]; groups: { id: string; member_ids: string[] }[] } | null>(null);
  const load = () => Promise.all([
    sb.from('perf_config').select('cfg').eq('id', 1).maybeSingle(), sb.from('profiles').select('*').eq('active', true),
    sb.from('batches').select('*').neq('status', 'huy'), sb.from('docs_v').select('id, batch_id, company, status, status_at, created_at, signs'),
    sb.from('chain_people').select('proc, company, role, user_id, group_id'), sb.from('work_groups').select('id, member_ids')
  ]).then(([c, p, b, d, cp, g]) => setSt({ cfg: { ...DEFAULT_CFG, ...((c.data?.cfg as PerfCfg) ?? {}) }, people: (p.data as Profile[]) ?? [], bs: (b.data as Batch[]) ?? [],
    ds: (d.data as D[]) ?? [], cp: (cp.data as CP[]) ?? [], groups: (g.data as { id: string; member_ids: string[] }[]) ?? [] }));
  useEffect(() => { load(); }, []);
  return { data: st, reload: load };
}

export function computeScores(x: NonNullable<ReturnType<typeof usePerf>['data']>, days?: number, offsetDays = 0): Score[] {
  const { cfg, people, bs, ds, cp, groups } = x; const P = days ?? cfg.period_days;
  const now = Date.now() - offsetDays * 864e5; const from = now - P * 864e5;
  // mọi lần ký trong kỳ: thời gian xử lý = từ lần ký trước (hoặc lúc tạo phiếu) đến lần này; bị trả về nếu lần kế tiếp là "trả về"
  type Sg = { u: string; role: string; h: number; ret: boolean; at: number };
  const sgs: Sg[] = [];
  for (const d of ds) {
    const s = [...(d.signs ?? [])].sort((a, z) => a.at.localeCompare(z.at)); let prev = d.created_at;
    s.forEach((g, i) => { const at = +new Date(g.at); const h = Math.max(0, (at - +new Date(prev)) / 36e5); prev = g.at;
      if (g.action === 'ky' && at >= from && at <= now) sgs.push({ u: g.user, role: d.company + '.' + g.role, h, ret: s[i + 1]?.action === 'tra_ve', at }); });
  }
  const roleAvg: Record<string, number> = {};
  for (const r of new Set(sgs.map((s) => s.role))) { const l = sgs.filter((s) => s.role === r); roleAvg[r] = l.reduce((a, s) => a + s.h, 0) / l.length; }
  // hồ sơ đang quá hạn trên tay từng người (theo người phụ trách bước hiện tại)
  const overdue: Record<string, number> = {};
  if (!offsetDays) for (const b of bs.filter((b) => b.status === 'dang_lam' || b.status === 'cho_ky')) {
    const st = stepOf(b, ds); const company = st.key === 'ky' ? 'PN' : st.company ?? 'PN'; const role = st.key === 'ky' ? 'hoan_tat' : ROLE_OF[st.doc?.status ?? ''];
    const since = ds.filter((d) => d.batch_id === b.id).map((d) => d.status_at).sort().pop() ?? b.created_at;
    if (!role || (Date.now() - +new Date(since)) / 36e5 < cfg.sla_h) continue;
    const r = cp.find((c) => c.proc === b.proc && c.company === company && c.role === role); if (!r) continue;
    const ids = r.user_id ? [r.user_id] : groups.find((g) => g.id === r.group_id)?.member_ids ?? [];
    for (const id of ids) overdue[id] = (overdue[id] ?? 0) + 1;
  }
  const by = people.map((p) => { const l = sgs.filter((s) => s.u === p.id); return { p, l }; });
  const vols = by.filter((x) => x.l.length >= cfg.min_steps).map((x) => x.l.length); const avgVol = vols.length ? vols.reduce((a, v) => a + v, 0) / vols.length : 1;
  const wsum = Math.max(1, cfg.w_ontime + cfg.w_speed + cfg.w_quality + cfg.w_volume);
  const out: Score[] = by.map(({ p, l }) => {
    const n = l.length; const ontime = n ? (l.filter((s) => s.h <= cfg.sla_h).length / n) * 100 : 0;
    const avgH = n ? l.reduce((a, s) => a + s.h, 0) / n : 0; const rAvg = n ? l.reduce((a, s) => a + (roleAvg[s.role] ?? s.h), 0) / n : 0;
    const returned = l.filter((s) => s.ret).length; const quality = n ? (1 - returned / n) * 100 : 0;
    const sSpeed = !n ? 0 : rAvg <= 0.01 ? 100 : Math.max(0, Math.min(100, 50 + 50 * (rAvg - avgH) / rAvg));
    const sVolume = Math.min(100, (n / (avgVol * cfg.volume_cap)) * 100);
    const od = overdue[p.id] ?? 0;
    const raw = (ontime * cfg.w_ontime + sSpeed * cfg.w_speed + quality * cfg.w_quality + sVolume * cfg.w_volume) / wsum;
    const score = Math.max(0, Math.min(100, raw - od * cfg.overdue_penalty));
    const weekly = Array.from({ length: 6 }, (_, i) => { const a = now - (6 - i) * 7 * 864e5, z = a + 7 * 864e5; const w = l.filter((s) => s.at >= a && s.at < z);
      return w.length ? Math.round((w.filter((s) => s.h <= cfg.sla_h).length / w.length) * 100) : -1; });
    return { id: p.id, name: p.full_name, unit: p.unit, steps: n, ontime, avgH, roleAvgH: rAvg, quality, returned, overdue: od, sOntime: ontime, sSpeed, sQuality: quality, sVolume,
      score: Math.round(score), ranked: n >= cfg.min_steps, rank: 0, rankCo: 0, nCo: 0, crown: false, crownWhy: [], prev: null, weekly };
  }).filter((s) => s.steps > 0 || s.overdue > 0);
  const ranked = out.filter((s) => s.ranked).sort((a, z) => z.score - a.score || z.ontime - a.ontime);
  ranked.forEach((s, i) => { s.rank = i + 1; });
  for (const u of new Set(ranked.map((s) => s.unit))) { const l = ranked.filter((s) => s.unit === u); l.forEach((s, i) => { s.rankCo = i + 1; s.nCo = l.length; }); }
  const top = ranked[0];
  if (top) { const why: string[] = [];
    if (top.ontime < cfg.crown_ontime) why.push(`đúng hạn ${Math.round(top.ontime)}% (cần ≥ ${cfg.crown_ontime}%)`);
    if (top.overdue > 0) why.push(`còn ${top.overdue} hồ sơ quá hạn`);
    if (top.steps < cfg.crown_min_steps) why.push(`mới xử lý ${top.steps} bước (cần ≥ ${cfg.crown_min_steps})`);
    top.crown = !why.length; top.crownWhy = why; }
  return out.sort((a, z) => (a.rank || 999) - (z.rank || 999));
}

/** Điểm kỳ này + kỳ trước (để thấy tăng / giảm) */
export function scoresWithTrend(x: NonNullable<ReturnType<typeof usePerf>['data']>, days?: number) {
  const cur = computeScores(x, days); const prev = computeScores(x, days, days ?? x.cfg.period_days);
  for (const s of cur) { const p = prev.find((q) => q.id === s.id); s.prev = p && p.ranked ? p.score : null; }
  return cur;
}
