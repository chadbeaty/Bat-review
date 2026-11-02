// Tone and topic scoring tuned for slowpitch bat talk. Deliberately simple and explainable.

import { normalize } from "./text.mjs";

const POSITIVE = {
  love: 2, loved: 2, loving: 2, great: 2, amazing: 2, awesome: 2, best: 2, beast: 2, monster: 2, unreal: 2, insane: 2,
  hot: 2, fire: 1, nasty: 1, legit: 1, solid: 1, smooth: 1, sweet: 1, nice: 1, good: 1, happy: 1, impressed: 2,
  recommend: 2, recommended: 2, favorite: 2, fav: 2, gamer: 1, rakes: 2, raking: 2, mashing: 2, mashes: 2, mash: 1,
  crushes: 2, crushing: 2, crush: 1, rocket: 2, rockets: 2, bombs: 2, bomb: 1, pops: 1, poppin: 2, popping: 2,
  durable: 2, lasted: 1, tank: 1, juiced: 2, explodes: 2, carry: 1, carries: 1, workhorse: 2, steal: 1, bargain: 1,
};

const NEGATIVE = {
  dead: -2, cracked: -3, cracking: -2, cracks: -2, broke: -2, split: -1, dented: -2, dent: -1, rattle: -2, rattling: -2,
  rattles: -2, sting: -1, stings: -2, stung: -1, garbage: -3, trash: -3, junk: -3, hate: -2, hated: -2, worst: -3,
  disappointed: -2, disappointing: -2, overpriced: -2, meh: -1, terrible: -3, awful: -3, waste: -2, returned: -1,
  refund: -1, flat: -1, mushy: -2, overrated: -2, overhyped: -2, failed: -2, fails: -2, heavy: -1, sucks: -2, sucked: -2,
  weak: -1, buzz: -1, vibration: -1, quit: -1,
};

const PHRASES = [
  [/\bout of the wrapper\b/, 1],
  [/\bhot out of\b/, 2],
  [/\bno sting\b/, 2],
  [/\bworth (it|every penny|the money)\b/, 2],
  [/\bnot worth\b/, -2],
  [/\bwaste of money\b/, -3],
  [/\bfailed (a |the )?compression\b/, -2],
  [/\bdidn'?t (last|hold up)\b/, -3],
  [/\bfell off\b/, -2],
  [/\bend ?cap (came|popped|fell) off\b/, -3],
];

const NEGATORS = new Set(["not", "no", "never", "isn't", "isnt", "wasn't", "wasnt", "didn't", "didnt", "doesn't", "doesnt", "don't", "dont", "ain't", "aint", "hardly", "nothing", "barely", "without"]);

export const TOPIC_PATTERNS = {
  pop: /\b(pop|pops|popping|hot|dead|distance|carry|carries|rocket|launch|exit velo|ev|juice|juiced|trampoline|over the fence|home ?runs?|hr|bombs?|mash\w*|rak\w*|crush\w*)\b/,
  durability: /\b(crack\w*|broke|broken|break(s)?|dent\w*|durab\w*|last(ed|s)?|hold(s|ing)? up|held up|warranty|rattl\w*|split|end ?cap|compression|seasons?)\b/,
  breakIn: /\b(break ?in|broke ?in|broken ?in|breaking ?in|wrapper|\d+ (hits|swings)|rolled|tee work)\b/,
  feel: /\b(sting\w*|vibration|feel(s)?|felt|balance(d)?|swing weight|whip|flex\w*|stiff|handle|end ?load\w*|heavy|light)\b/,
  sound: /\b(sound(s)?|ping|loud|quiet|tink|crack of the bat)\b/,
  value: /\b(price|priced|overpriced|deal|money|cheap|cheaper|expensive|value|bargain|steal|\$\d+|worth (it|the money))\b/,
};

function tokenize(s) {
  return s.match(/[a-z']+|\$\d+/g) || [];
}

// Score one piece of text. Returns a number in [-1, 1].
export function scoreText(text) {
  // "Broken in" and "break-in" describe the break-in process, not a broken bat.
  const t = normalize(text)
    .replace(/\b(break|broke|broken|breaking)[\s-]?in\b/g, " breakin ")
    .replace(/\bcrack of the bat\b/g, " ");
  let sum = 0;
  let hits = 0;
  for (const [re, w] of PHRASES) {
    if (re.test(t)) {
      sum += w;
      hits += 1;
    }
  }
  const tokens = tokenize(t);
  tokens.forEach((tok, i) => {
    const w = POSITIVE[tok] ?? NEGATIVE[tok];
    if (w == null) return;
    const window = tokens.slice(Math.max(0, i - 3), i);
    const negated = window.some((x) => NEGATORS.has(x));
    // "no sting" is already counted as a phrase.
    if (tok.startsWith("sting") && window.includes("no")) return;
    sum += negated ? -w * 0.75 : w;
    hits += 1;
  });
  if (!hits) return 0;
  return Math.tanh(sum / 3);
}

export function toneOf(score) {
  if (score > 0.2) return "good";
  if (score < -0.2) return "bad";
  return "mixed";
}

// Topic hits with the tone of the sentence they appear in.
export function topicsOf(sentences) {
  const out = {};
  for (const s of sentences) {
    const n = normalize(s);
    for (const [topic, re] of Object.entries(TOPIC_PATTERNS)) {
      if (re.test(n)) {
        const sc = scoreText(s);
        const prev = out[topic];
        out[topic] = prev == null ? sc : (prev + sc) / 2;
      }
    }
  }
  return out;
}
