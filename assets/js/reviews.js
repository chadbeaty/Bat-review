// Player reviews written on this site. Uses Supabase when configured, otherwise this device's storage.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { store } from "./store.js";
import { esc, formatDate, toast } from "./ui.js";

const shared = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function reviewsBackend() {
  return { shared };
}

const headers = () => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
});

async function listReviews(batId) {
  if (!shared) return store.localReviews(batId);
  const url = `${SUPABASE_URL}/rest/v1/reviews?bat_id=eq.${encodeURIComponent(batId)}&select=*&order=created_at.desc&limit=100`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error("Could not load reviews");
  return res.json();
}

async function addReview(batId, review) {
  if (!shared) {
    const row = { ...review, bat_id: batId, created_at: new Date().toISOString() };
    store.addLocalReview(batId, row);
    return row;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=representation" },
    body: JSON.stringify({ ...review, bat_id: batId }),
  });
  if (!res.ok) throw new Error("Could not save the review");
  return (await res.json())[0];
}

const ASPECTS = [
  ["rating", "Overall"],
  ["pop", "Pop"],
  ["durability", "Durability"],
  ["feel", "Feel"],
];

function starsInput(name, label) {
  return `<div class="rating-row"><span id="lbl-${name}">${label}</span>
    <div class="stars" role="radiogroup" aria-labelledby="lbl-${name}" data-name="${name}">
      ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="false" aria-label="${n} of 5" data-v="${n}">★</button>`).join("")}
    </div></div>`;
}

function starsText(n) {
  return n ? "★".repeat(n) + "☆".repeat(5 - n) : "";
}

function reviewHTML(r) {
  const aspects = ASPECTS.slice(1)
    .filter(([k]) => r[k])
    .map(([k, l]) => `${l} ${r[k]}/5`)
    .join(" · ");
  return `<li class="review">
    <div class="review-meta"><strong style="color:var(--ink)" aria-label="${r.rating} out of 5">${starsText(r.rating)}</strong>${r.name ? `<span>${esc(r.name)}</span>` : ""}${r.league ? `<span>${esc(r.league)}</span>` : ""}${r.weight ? `<span>${esc(r.weight)} oz</span>` : ""}<span>${esc(formatDate(r.created_at))}</span></div>
    ${aspects ? `<div class="small muted">${esc(aspects)}</div>` : ""}
    ${r.body ? `<p>${esc(r.body)}</p>` : ""}
  </li>`;
}

export async function renderReviews(root, bat) {
  root.innerHTML = `<ul class="quotes" id="review-list"><li class="muted small">Loading reviews…</li></ul>
    <details style="margin-top:16px" id="review-details">
      <summary class="btn" style="width:max-content;list-style:none">Write a review</summary>
      <form class="review-form" id="review-form" style="margin-top:16px" novalidate>
        ${ASPECTS.map(([k, l]) => starsInput(k, l + (k === "rating" ? " *" : ""))).join("")}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
          <label class="field" for="rv-weight">Weight you swing
            <select class="select" id="rv-weight"><option value="">Choose</option>${bat.weights.map((w) => `<option>${w}</option>`).join("")}</select></label>
          <label class="field" for="rv-league">Where you play
            <select class="select" id="rv-league"><option value="">Choose</option><option>Rec league</option><option>Church league</option><option>Tournament</option><option>Senior</option></select></label>
        </div>
        <label class="field" for="rv-body">What should other players know?
          <textarea class="textarea" id="rv-body" maxlength="2000" placeholder="Pop, break-in, how long it lasted, sting, sound…"></textarea></label>
        <label class="field" for="rv-name">Name or nickname (optional)
          <input class="input" id="rv-name" maxlength="40" autocomplete="nickname"></label>
        <p class="small muted" id="rv-error" role="alert"></p>
        <div><button class="btn primary" type="submit">Post review</button></div>
        ${shared ? "" : '<p class="small muted">Reviews are saved on this device until the site owner connects a shared database.</p>'}
      </form>
    </details>`;

  const list = root.querySelector("#review-list");
  const values = {};
  root.querySelectorAll(".stars").forEach((group) => {
    const buttons = [...group.querySelectorAll("button")];
    buttons.forEach((b) =>
      b.addEventListener("click", () => {
        const v = Number(b.dataset.v);
        values[group.dataset.name] = v;
        buttons.forEach((x) => {
          x.classList.toggle("on", Number(x.dataset.v) <= v);
          x.setAttribute("aria-checked", String(Number(x.dataset.v) === v));
        });
      })
    );
  });

  async function refresh() {
    try {
      const rows = await listReviews(bat.id);
      list.innerHTML = rows.length
        ? rows.map(reviewHTML).join("")
        : `<li class="muted">No reviews yet. If you've swung this bat, yours will be the first.</li>`;
    } catch (err) {
      list.innerHTML = `<li class="muted">Reviews could not be loaded right now. Try again in a minute.</li>`;
    }
  }

  root.querySelector("#review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = root.querySelector("#rv-error");
    if (!values.rating) {
      error.textContent = "Choose an overall rating from 1 to 5 stars.";
      return;
    }
    error.textContent = "";
    const review = {
      rating: values.rating,
      pop: values.pop || null,
      durability: values.durability || null,
      feel: values.feel || null,
      weight: root.querySelector("#rv-weight").value || null,
      league: root.querySelector("#rv-league").value || null,
      body: root.querySelector("#rv-body").value.trim().slice(0, 2000) || null,
      name: root.querySelector("#rv-name").value.trim().slice(0, 40) || null,
    };
    try {
      await addReview(bat.id, review);
      toast("Review posted");
      renderReviews(root, bat);
    } catch {
      error.textContent = "The review didn't save. Check your connection and try again.";
    }
  });

  refresh();
}
