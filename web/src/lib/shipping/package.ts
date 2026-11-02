// Package rules for long bat boxes: dimensional weight, carrier size and weight limits, and why an option
// can't be used. Limits are the carriers' published retail rules at the time of writing; Shippo applies the
// carriers' real rules when it quotes, so these mainly explain to buyers why an option is missing, and drive the
// fake provider. Re-check them against the carriers' current pages before launch.

import type { Parcel } from "./types";

export type CarrierRule = {
  carrier: "usps" | "ups" | "fedex";
  label: string;
  maxWeightOz: number;
  maxLengthIn: number;
  maxLengthPlusGirthIn: number;
  /** Cubic inches per pound for dimensional weight. */
  dimDivisor: number;
  /** Dimensional weight applies only above this volume (cubic inches); 0 = always. */
  dimMinVolumeCuIn: number;
};

export const CARRIER_RULES: Record<CarrierRule["carrier"], CarrierRule> = {
  usps: { carrier: "usps", label: "USPS", maxWeightOz: 70 * 16, maxLengthIn: 108, maxLengthPlusGirthIn: 130, dimDivisor: 166, dimMinVolumeCuIn: 1728 },
  ups: { carrier: "ups", label: "UPS", maxWeightOz: 150 * 16, maxLengthIn: 108, maxLengthPlusGirthIn: 165, dimDivisor: 139, dimMinVolumeCuIn: 0 },
  fedex: { carrier: "fedex", label: "FedEx", maxWeightOz: 150 * 16, maxLengthIn: 108, maxLengthPlusGirthIn: 165, dimDivisor: 139, dimMinVolumeCuIn: 0 },
};

export type ServiceRule = {
  token: string;
  carrier: CarrierRule["carrier"];
  service: string;
  /** Extra limit for this service (USPS Priority Mail is 108" length + girth). */
  maxLengthPlusGirthIn?: number;
  estimatedDays: number;
};

export const SERVICES: ServiceRule[] = [
  { token: "usps_ground_advantage", carrier: "usps", service: "Ground Advantage", estimatedDays: 4 },
  { token: "usps_priority", carrier: "usps", service: "Priority Mail", maxLengthPlusGirthIn: 108, estimatedDays: 2 },
  { token: "ups_ground", carrier: "ups", service: "Ground", estimatedDays: 4 },
  { token: "fedex_home_delivery", carrier: "fedex", service: "Home Delivery", estimatedDays: 4 },
];

/** Sorted sides, longest first. */
function sides(p: Parcel): [number, number, number] {
  const s = [p.lengthIn, p.widthIn, p.heightIn].sort((a, b) => b - a);
  return [s[0], s[1], s[2]];
}

export function lengthPlusGirth(p: Parcel): number {
  const [l, w, h] = sides(p);
  return round1(l + 2 * (w + h));
}

export function volumeCuIn(p: Parcel): number {
  return p.lengthIn * p.widthIn * p.heightIn;
}

/** Dimensional weight in ounces for a carrier (0 when it doesn't apply), rounded up to a whole pound. */
export function dimensionalWeightOz(p: Parcel, rule: CarrierRule): number {
  const vol = volumeCuIn(p);
  if (vol <= rule.dimMinVolumeCuIn) return 0;
  return Math.ceil(vol / rule.dimDivisor) * 16;
}

/** The weight the carrier charges for: the greater of actual weight and dimensional weight. */
export function billableWeightOz(p: Parcel, rule: CarrierRule): number {
  return Math.max(Math.ceil(p.weightOz), dimensionalWeightOz(p, rule));
}

/** Why a service can't take this package, or null if it can. */
export function unavailableReason(p: Parcel, service: ServiceRule): string | null {
  const rule = CARRIER_RULES[service.carrier];
  const [longest] = sides(p);
  const lg = lengthPlusGirth(p);
  if (p.weightOz > rule.maxWeightOz) return `Too heavy for ${rule.label} (limit ${rule.maxWeightOz / 16} lb)`;
  if (longest > rule.maxLengthIn) return `Too long for ${rule.label} (longest side limit ${rule.maxLengthIn}")`;
  if (lg > rule.maxLengthPlusGirthIn) return `Too big for ${rule.label}: length + girth is ${lg}" (limit ${rule.maxLengthPlusGirthIn}")`;
  if (service.maxLengthPlusGirthIn && lg > service.maxLengthPlusGirthIn)
    return `Too big for ${rule.label} ${service.service}: length + girth is ${lg}" (limit ${service.maxLengthPlusGirthIn}")`;
  return null;
}

export type PackageCheck = { ok: true; parcel: Parcel } | { ok: false; error: string };

/** Builds the parcel from a listing's package fields, or explains what is missing. */
export function parcelFromListing(l: {
  shipping_weight_oz: number | string | null;
  package_length_inches: number | string | null;
  package_width_inches: number | string | null;
  package_height_inches: number | string | null;
}): PackageCheck {
  const n = (v: number | string | null) => (v == null || v === "" ? NaN : Number(v));
  const parcel = {
    weightOz: n(l.shipping_weight_oz),
    lengthIn: n(l.package_length_inches),
    widthIn: n(l.package_width_inches),
    heightIn: n(l.package_height_inches),
  };
  if (Object.values(parcel).some((v) => !Number.isFinite(v) || v <= 0)) {
    return { ok: false, error: "The seller hasn't entered the package size and weight, so shipping can't be quoted." };
  }
  return { ok: true, parcel };
}

/** Is the package a long box (most bats ship in 34"+ boxes)? Used to explain carrier surcharges to buyers. */
export function isLongPackage(p: Parcel): boolean {
  return sides(p)[0] > 30;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
