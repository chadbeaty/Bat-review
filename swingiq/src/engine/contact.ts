/**
 * Bat-ball contact from sound. Contact is a sharp, broadband crack that jumps far above the background for a few
 * milliseconds. The audio worklet sends the high-passed energy of each ~3 ms block; this finds the onsets.
 * Swing windows decide which onset belongs to which swing, so other cages' hits are ignored.
 */
export type ContactConfig = {
  /** Onset must be this many times the running background level. */
  ratio: number;
  /** Absolute minimum energy (RMS of high-passed samples, 0–1). */
  minEnergy: number;
  /** Ignore new onsets for this long after one. */
  refractoryMs: number;
  /** How fast the background estimate adapts (0–1 per block). */
  floorRate: number;
};

export const DEFAULT_CONTACT: ContactConfig = { ratio: 7, minEnergy: 0.02, refractoryMs: 150, floorRate: 0.02 };

export class ContactListener {
  private floor = 0.002;
  private lastOnset = -Infinity;
  private onsets: { t: number; strength: number }[] = [];
  constructor(private cfg: ContactConfig = DEFAULT_CONTACT) {}

  /** Feed one block: time (ms on the session clock) and energy. Returns an onset time if this block is one. */
  push(t: number, energy: number): number | null {
    const isOnset = energy > this.cfg.minEnergy && energy > this.floor * this.cfg.ratio && t - this.lastOnset > this.cfg.refractoryMs;
    // Track the background with a slow follower that ignores loud spikes.
    const target = Math.min(energy, this.floor * 3);
    this.floor += (target - this.floor) * this.cfg.floorRate;
    this.floor = Math.max(this.floor, 0.0005);
    if (isOnset) {
      this.lastOnset = t;
      this.onsets.push({ t, strength: energy / this.floor });
      if (this.onsets.length > 50) this.onsets.shift();
      return t;
    }
    return null;
  }

  /** Strongest onset inside [from, to], or null. */
  contactIn(from: number, to: number): number | null {
    let best: { t: number; strength: number } | null = null;
    for (const o of this.onsets) if (o.t >= from && o.t <= to && (!best || o.strength > best.strength)) best = o;
    return best?.t ?? null;
  }
}
