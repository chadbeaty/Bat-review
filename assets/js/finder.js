// Five-question Bat Finder. rankBats() is pure so it can be tested in Node.

import { LOAD, BUILD } from "./data.js";

export const QUESTIONS = [
  {
    key: "league",
    title: "Where do you play?",
    help: "Your league's stamp rule is the one thing you can't get wrong.",
    options: [
      { v: "USSSA", label: "USSSA", sub: "Most tournaments and many rec leagues" },
      { v: "USA", label: "USA Softball (ASA)", sub: "City, church and many rec leagues" },
      { v: "BOTH", label: "Both", sub: "I need one bat that's legal everywhere" },
      { v: "SSUSA", label: "Senior (SSUSA)", sub: "50+ senior leagues" },
      { v: "NSA", label: "NSA or ISA", sub: "Smaller associations" },
      { v: "UNSURE", label: "I'm not sure", sub: "We'll stick to dual-stamp bats, which are legal in USA and USSSA play" },
    ],
  },
  {
    key: "hitter",
    title: "What kind of hitter are you?",
    help: "Be honest. Picking the right weight distribution matters more than the brand.",
    options: [
      { v: "power", label: "Power", sub: "I swing for the fence and square it up often" },
      { v: "gap", label: "Gap-to-gap", sub: "Hard line drives, some home runs" },
      { v: "contact", label: "Contact", sub: "Placement, singles, getting on base" },
    ],
  },
  {
    key: "feel",
    title: "How do you like a bat to feel?",
    help: "One-piece bats are stiff. Two-piece bats flex a little and sting less on mis-hits.",
    options: [
      { v: "1pc", label: "Stiff, lots of feedback", sub: "One-piece" },
      { v: "2pc", label: "Some whip, less sting", sub: "Two-piece" },
      { v: "any", label: "No preference", sub: "" },
    ],
  },
  {
    key: "budget",
    title: "What's your budget?",
    help: "Most top USSSA and USA bats list around $300.",
    options: [
      { v: "150", label: "Under $150", sub: "Alloys, wood composites and closeouts" },
      { v: "250", label: "Up to $250", sub: "Last year's models and value lines" },
      { v: "325", label: "Up to $325", sub: "Almost every current model" },
      { v: "any", label: "Whatever it takes", sub: "" },
    ],
  },
  {
    key: "priority",
    title: "What matters most?",
    help: "There's a real trade-off between peak pop and a bat that lasts.",
    options: [
      { v: "pop", label: "Maximum pop", sub: "I'll break it in and baby it" },
      { v: "durability", label: "Lasts all year", sub: "Cold games, practice, no break-in" },
      { v: "balance", label: "A bit of both", sub: "" },
    ],
  },
];

const LOAD_FIT = {
  power: { heavy: 3, endload: 3, balanced: 0 },
  gap: { heavy: 0, endload: 2, balanced: 3 },
  contact: { heavy: -2, endload: 1, balanced: 3 },
};

function stampFit(bat, league) {
  switch (league) {
    case "USSSA":
      return bat.stamps.includes("USSSA") ? [2, null] : null;
    case "USA":
      return bat.stamps.includes("USA") ? [2, null] : null;
    case "BOTH":
    case "UNSURE":
      return bat.dual ? [2, "Dual stamp: legal in USA and USSSA"] : null;
    case "SSUSA":
      return bat.stamps.includes("SSUSA") ? [2, "Senior stamp"] : null;
    case "NSA":
      if (bat.stamps.includes("NSA") || bat.stamps.includes("ISA")) return [2, "NSA/ISA stamp on the barrel"];
      if (bat.stamps.includes("USSSA")) return [0, "USSSA stamp: often accepted, check your league"];
      return null;
    default:
      return [0, null];
  }
}

export function rankBats(bats, answers, limit = 8) {
  const max = 2 + 3 + 2 + 3 + 3;
  const scored = [];
  for (const bat of bats) {
    const stamp = stampFit(bat, answers.league);
    if (!stamp) continue;
    const budget = answers.budget && answers.budget !== "any" ? Number(answers.budget) : null;
    if (budget && bat.effectivePrice != null && bat.effectivePrice > budget) continue;

    let score = stamp[0];
    const why = [];
    if (stamp[1]) why.push(stamp[1]);

    if (answers.hitter && bat.load) {
      const fit = LOAD_FIT[answers.hitter][bat.load] ?? 0;
      score += fit;
      if (fit >= 3) why.push(`${LOAD[bat.load]} suits a ${answers.hitter === "gap" ? "gap-to-gap" : answers.hitter} hitter`);
    }
    if (answers.feel && answers.feel !== "any") {
      if (bat.build === answers.feel) {
        score += 2;
        why.push(BUILD[bat.build]);
      } else score -= 1;
    }
    if (answers.priority === "pop") {
      score += { composite: 3, alloy: -1, "wood-composite": -2 }[bat.material] ?? 0;
      if (bat.material === "composite") why.push("Composite for the most pop");
    } else if (answers.priority === "durability") {
      score += { composite: 0, alloy: 3, "wood-composite": 3 }[bat.material] ?? 0;
      if (bat.material !== "composite") why.push("Durable, no break-in");
    } else if (answers.priority === "balance") {
      score += 1.5;
    }
    if (bat.score != null) {
      score += (bat.score - 50) / 15;
      if (bat.score >= 65) why.push(`Players rate it ${bat.score}/100`);
    }
    score += bat.year >= 2027 ? 0.5 : bat.year === 2026 ? 0.25 : 0;
    if (bat.reviewCount) {
      score += 0.3;
      why.push(`${bat.reviewCount} published review${bat.reviewCount === 1 ? "" : "s"}`);
    }
    if (budget && bat.effectivePrice != null) why.push(`$${Math.round(bat.effectivePrice)} fits your budget`);

    scored.push({ bat, score, why, match: Math.max(1, Math.min(99, Math.round((score / max) * 100))) });
  }
  scored.sort((a, b) => b.score - a.score || (b.bat.mentions || 0) - (a.bat.mentions || 0));

  // At most two picks from the same bat line keeps the list varied.
  const perFamily = new Map();
  const out = [];
  for (const s of scored) {
    const n = perFamily.get(s.bat.family) || 0;
    if (n >= 2) continue;
    perFamily.set(s.bat.family, n + 1);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
