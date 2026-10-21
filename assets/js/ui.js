// Shared HTML helpers. Everything that comes from data goes through esc().

import { BUILD, MATERIAL, LOAD, MIN_MENTIONS_FOR_SCORE } from "./data.js";

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const icons = {
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  starFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 4v16M16 4v16M4 8h8M12 16h8"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

export function stampsHTML(bat) {
  const parts = bat.stamps.map((s) => `<span class="stamp" title="Stamped ${esc(s)}">${esc(s)}</span>`);
  if (bat.dual) parts.unshift('<span class="stamp dual" title="Legal in both USA and USSSA play">DUAL</span>');
  return `<span class="stamps">${parts.join("")}</span>`;
}

export function money(n) {
  if (n == null) return "";
  return "$" + (Number.isInteger(n) ? n : n.toFixed(2));
}

export function priceHTML(bat) {
  if (bat.price == null) return '<span class="price muted">Check price</span>';
  const approx = bat.priceApprox ? '<span title="Typical retail price; check current listings">~</span>' : "";
  if (bat.salePrice != null && bat.salePrice < bat.price) {
    return `<span class="price"><s>${money(bat.price)}</s>${money(bat.salePrice)}</span>`;
  }
  return `<span class="price">${approx}${money(bat.price)}</span>`;
}

export function specLine(bat) {
  return [
    bat.year,
    BUILD[bat.build],
    MATERIAL[bat.material],
    bat.load ? LOAD[bat.load] : null,
    bat.barrel ? `${bat.barrel}" barrel` : null,
  ]
    .filter(Boolean)
    .map((x) => `<span>${esc(x)}</span>`)
    .join("");
}

export function pulseHTML(bat) {
  const talk = bat.talk;
  if (!talk || !talk.mentions) return "";
  if (talk.mentions < MIN_MENTIONS_FOR_SCORE) {
    return `<span class="pulse none" title="Not enough posts for a score"><b>—</b>${talk.mentions} post${talk.mentions === 1 ? "" : "s"}</span>`;
  }
  return `<span class="pulse" title="Community score from ${talk.mentions} posts about the ${esc(bat.familyInfo?.name || "")} line"><b>${talk.score}</b>${talk.mentions} posts</span>`;
}

export function toneLabel(tone) {
  return tone === "good" ? "Positive" : tone === "bad" ? "Negative" : "Mixed";
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2400);
}

export function batRowHTML(bat, { extra = "" } = {}) {
  return `<li class="bat-row" data-id="${esc(bat.id)}">
    <div class="bat-row-main">
      <span class="bat-brand">${esc(bat.brand)}</span>
      <a class="bat-name" href="#bat-${esc(bat.id)}">${esc(bat.model)}</a>
      <div class="bat-meta">${stampsHTML(bat)}${specLine(bat)}</div>
      ${extra}
    </div>
    <div class="bat-side">
      ${pulseHTML(bat)}
      ${priceHTML(bat)}
      ${actionButtons(bat)}
    </div>
  </li>`;
}

export function actionButtons(bat) {
  return `<button class="icon-btn" type="button" data-act="save" data-id="${esc(bat.id)}" aria-pressed="false" aria-label="Save ${esc(bat.name)}" title="Save">${icons.star}</button>
    <button class="icon-btn" type="button" data-act="compare" data-id="${esc(bat.id)}" aria-pressed="false" aria-label="Compare ${esc(bat.name)}" title="Add to compare">${icons.compare}</button>`;
}
