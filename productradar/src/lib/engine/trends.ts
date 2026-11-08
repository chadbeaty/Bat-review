// Early-trend metrics from observed mentions. Measures acceleration (is attention speeding up?) rather than
// raw volume, and reports what it could not measure instead of treating it as zero.

export type MentionPoint = {
  observedAt: Date;
  creatorKey: string | null;
  platform: string;
  views: number | null;
};

export type TrendInput = {
  mentions: MentionPoint[];
  firstObservedAt: Date | null;
  /** Relative daily view growth of the product's recent videos (0.5 = +50% per day), or null if not measurable yet. */
  engagementGrowth: number | null;
  /** Search interest (0-100) and its growth, from Google Trends once connected. Null = not available. */
  searchInterest: number | null;
  searchInterestGrowth: number | null;
  sellersDetected: number | null;
  now?: Date;
};

export type TrendMetrics = {
  mentions_24h: number;
  mentions_72h: number;
  mentions_7d: number;
  mentions_prev_7d: number;
  mentions_total: number;
  unique_creators_7d: number;
  unique_creators_total: number;
  unique_platforms: number;
  views_7d: number | null;
  engagement_growth: number | null;
  search_interest: number | null;
  search_interest_growth: number | null;
  sellers_detected: number | null;
  growth_rate: number;
  acceleration: number;
  age_days: number;
  coverage: { mentions: true; engagement: boolean; search: boolean; sellers: boolean; platforms: string[] };
};

const H = 3600_000;
const D = 24 * H;

export function computeTrend(input: TrendInput): TrendMetrics {
  const now = input.now ?? new Date();
  const t = now.getTime();
  const within = (from: number, to: number) => input.mentions.filter((m) => m.observedAt.getTime() > t - from && m.observedAt.getTime() <= t - to);
  const last24 = within(D, -H);
  const last72 = within(3 * D, -H);
  const last7 = within(7 * D, -H);
  const prev7 = within(14 * D, 7 * D);
  const baseline = within(14 * D, 3 * D);

  const creators = (ms: MentionPoint[]) => new Set(ms.map((m) => m.creatorKey).filter(Boolean)).size;
  const platforms = [...new Set(input.mentions.map((m) => m.platform))];
  const views7 = last7.map((m) => m.views).filter((v): v is number => typeof v === "number");

  const first = input.firstObservedAt ?? (input.mentions.length ? new Date(Math.min(...input.mentions.map((m) => m.observedAt.getTime()))) : now);
  const ageDays = Math.max(0, (t - first.getTime()) / D);

  // Velocity in the last 3 days vs. the 11 days before (Laplace-smoothed so one mention isn't infinite growth).
  const recentPerDay = last72.length / 3;
  const baselineDays = Math.min(11, Math.max(0, ageDays - 3));
  const baselinePerDay = baselineDays > 0 ? baseline.length / baselineDays : 0;
  const acceleration = Math.min(20, (recentPerDay + 0.25) / (baselinePerDay + 0.25));

  return {
    mentions_24h: last24.length,
    mentions_72h: last72.length,
    mentions_7d: last7.length,
    mentions_prev_7d: prev7.length,
    mentions_total: input.mentions.length,
    unique_creators_7d: creators(last7),
    unique_creators_total: creators(input.mentions),
    unique_platforms: platforms.length,
    views_7d: views7.length ? views7.reduce((a, b) => a + b, 0) : null,
    engagement_growth: input.engagementGrowth,
    search_interest: input.searchInterest,
    search_interest_growth: input.searchInterestGrowth,
    sellers_detected: input.sellersDetected,
    growth_rate: round((last7.length - prev7.length) / Math.max(prev7.length, 1)),
    acceleration: round(acceleration),
    age_days: round(ageDays),
    coverage: {
      mentions: true,
      engagement: input.engagementGrowth !== null,
      search: input.searchInterest !== null,
      sellers: input.sellersDetected !== null,
      platforms,
    },
  };
}

/**
 * Daily view growth across a set of videos from their stat snapshots: (views now - views at first snapshot) per day,
 * relative to the first snapshot. Null when no video has two snapshots at least 6 hours apart.
 */
export function viewGrowth(series: { observedAt: Date; views: number | null }[][]): number | null {
  let start = 0;
  let end = 0;
  let days = 0;
  let used = 0;
  for (const s of series) {
    const pts = s.filter((p) => typeof p.views === "number").sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
    if (pts.length < 2) continue;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const span = (b.observedAt.getTime() - a.observedAt.getTime()) / D;
    if (span < 0.25) continue;
    start += a.views as number;
    end += b.views as number;
    days += span;
    used++;
  }
  if (!used) return null;
  const avgDays = days / used;
  return round((end - start) / Math.max(start, 1) / avgDays);
}

function round(n: number, places = 3) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
