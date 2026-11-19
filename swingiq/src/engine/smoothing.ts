import type { Landmark } from "./types";

/**
 * One Euro filter (Casiez et al., 2012): removes jitter when a point is still and stays responsive when it moves fast.
 * It's the standard filter for live pose overlays. Analysis uses the raw points plus its own smoothing, so fast hands
 * are never lagged by this filter.
 */
class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tMs: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    this.tPrev = tMs;
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    this.dxPrev = dxHat;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    return xHat;
  }
}

/** Smooths all 33 landmarks for drawing. */
export class LandmarkSmoother {
  private filters: OneEuro[][] = [];

  smooth(lm: Landmark[], tMs: number): Landmark[] {
    if (this.filters.length !== lm.length) {
      this.filters = lm.map(() => [new OneEuro(1.5, 0.8), new OneEuro(1.5, 0.8)]);
    }
    return lm.map((p, i) => ({
      x: this.filters[i][0].filter(p.x, tMs),
      y: this.filters[i][1].filter(p.y, tMs),
      z: p.z,
      v: p.v,
    }));
  }

  reset() {
    this.filters = [];
  }
}
