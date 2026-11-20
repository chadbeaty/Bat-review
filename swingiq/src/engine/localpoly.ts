// Local polynomial regression on real (possibly uneven) timestamps.
//
// Savitzky–Golay smoothing is a local polynomial fit on an even grid. Phones drop frames, especially when hot, so a
// 240 fps clip can have gaps; fitting on the real timestamps keeps velocities honest across a dropped frame instead of
// assuming every step is 1/240 s. A cubic over a short window follows a peak far better than a moving average, which
// flattens it (a moving average over 9 frames would shave several mph off a peak bat speed).

export type LocalFit = {
  /** Smoothed value at each input time. */
  y: number[];
  /** First derivative (units per second) at each input time. */
  dy: number[];
  /** Residual standard deviation of the fits (same units as y). */
  sigma: number;
  /** Per-sample standard error of the derivative, from the residuals and each fit's design. */
  dySe: number[];
};

/**
 * Fits a weighted polynomial (order 1–3) in a window of ±halfWindowS seconds around every sample.
 * Times in seconds. Tricube weights; windows that hold too few points widen until they have order + 3.
 */
export function localPoly(ts: number[], ys: number[], halfWindowS: number, order: 1 | 2 | 3 = 3, weights?: number[]): LocalFit {
  const n = ts.length;
  const y = new Array<number>(n).fill(NaN);
  const dy = new Array<number>(n).fill(NaN);
  const dyVarUnit = new Array<number>(n).fill(NaN);
  let ssr = 0;
  let dof = 0;
  const p = order + 1;
  for (let i = 0; i < n; i++) {
    let h = halfWindowS;
    let idx: number[] = [];
    for (let tries = 0; tries < 6; tries++) {
      idx = [];
      for (let j = 0; j < n; j++) if (Math.abs(ts[j] - ts[i]) <= h) idx.push(j);
      if (idx.length >= p + 2) break;
      h *= 1.5;
    }
    if (idx.length < p) continue;
    // Normal equations A^T W A c = A^T W y, with the basis centered on ts[i].
    const M = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const b = new Array<number>(p).fill(0);
    for (const j of idx) {
      const u = (ts[j] - ts[i]) / h;
      const w0 = Math.max(0, 1 - Math.abs(u) ** 3) ** 3 + 1e-6;
      const w = w0 * (weights ? weights[j] : 1);
      const dt = ts[j] - ts[i];
      const pw = [1, dt, dt * dt, dt * dt * dt];
      for (let r = 0; r < p; r++) {
        b[r] += w * pw[r] * ys[j];
        for (let c = 0; c < p; c++) M[r][c] += w * pw[r] * pw[c];
      }
    }
    const inv = invert(M);
    if (!inv) continue;
    const c = inv.map((row) => row.reduce((s, v, k) => s + v * b[k], 0));
    y[i] = c[0];
    dy[i] = c[1];
    // Var(c1) for unit-variance noise: (M^-1 A^T W^2 A M^-1)[1][1]; with tricube weights, approximate by M^-1[1][1]
    // scaled by the effective weight. Good enough for an error band.
    dyVarUnit[i] = Math.max(0, inv[1][1]);
    // In-window residual at the center sample only (keeps the residual estimate local and cheap).
    ssr += (ys[i] - c[0]) ** 2;
    dof++;
  }
  // Residuals at the center are shrunk by the fit's own leverage; inflate a little to compensate.
  const sigma = dof > p ? Math.sqrt(ssr / dof) * 1.35 : 0;
  const dySe = dyVarUnit.map((v) => (Number.isFinite(v) ? sigma * Math.sqrt(v) : NaN));
  return { y, dy, sigma, dySe };
}

function invert(M: number[][]): number[][] | null {
  const n = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-18) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    for (let k = 0; k < 2 * n; k++) A[col][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (f === 0) continue;
      for (let k = 0; k < 2 * n; k++) A[r][k] -= f * A[col][k];
    }
  }
  return A.map((r) => r.slice(n));
}
