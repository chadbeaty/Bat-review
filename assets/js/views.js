import { LEAGUES, BUILD, MATERIAL, LOAD, TOPICS, STAMPS, MIN_MENTIONS_FOR_SCORE } from "./data.js";
import { store } from "./store.js";
import { esc, stampsHTML, priceHTML, specLine, pulseHTML, batRowHTML, actionButtons, money, toneLabel, formatDate, icons } from "./ui.js";
import { reviewsBackend, renderReviews } from "./reviews.js";

/* ---------- Shared filter state (the URL hash can't carry it, so it lives here) ---------- */

export const emptyFilters = () => ({
  q: "",
  leagues: [],
  dualOnly: false,
  brands: [],
  builds: [],
  materials: [],
  loads: [],
  barrels: [],
  years: [],
  maxPrice: null,
  sort: null,
});

let filters = { ...emptyFilters(), ...(store.filters || {}) };
export function setFilters(next) {
  filters = { ...emptyFilters(), ...next };
  store.setFilters(filters);
}

const BARRELS = [
  { id: "12", label: '12"', test: (b) => b <= 12.25 },
  { id: "12.5", label: '12.5–12.75"', test: (b) => b > 12.25 && b < 12.9 },
  { id: "13", label: '13"', test: (b) => b >= 12.9 && b < 13.25 },
  { id: "13.5", label: '13.5–14"', test: (b) => b >= 13.25 },
];

function matches(bat, f, skip) {
  if (skip !== "q" && f.q) {
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.every((w) => bat.searchText.includes(w))) return false;
  }
  if (skip !== "leagues" && f.leagues.length && !f.leagues.some((l) => bat.stamps.includes(l))) return false;
  if (f.dualOnly && !bat.dual) return false;
  if (skip !== "brands" && f.brands.length && !f.brands.includes(bat.brand)) return false;
  if (skip !== "builds" && f.builds.length && !f.builds.includes(bat.build)) return false;
  if (skip !== "materials" && f.materials.length && !f.materials.includes(bat.material)) return false;
  if (skip !== "loads" && f.loads.length && !f.loads.includes(bat.load)) return false;
  if (skip !== "barrels" && f.barrels.length && !(bat.barrel && f.barrels.some((id) => BARRELS.find((x) => x.id === id).test(bat.barrel)))) return false;
  if (skip !== "years" && f.years.length && !f.years.includes(String(bat.year))) return false;
  if (f.maxPrice != null && bat.effectivePrice != null && bat.effectivePrice > f.maxPrice) return false;
  return true;
}

const SORTS = {
  talked: { label: "Most talked about", fn: (a, b) => b.mentions - a.mentions || b.year - a.year },
  score: { label: "Best community score", fn: (a, b) => (b.score ?? -1) - (a.score ?? -1) || b.mentions - a.mentions },
  newest: { label: "Newest", fn: (a, b) => b.year - a.year || a.name.localeCompare(b.name) },
  "price-asc": { label: "Price: low to high", fn: (a, b) => (a.effectivePrice ?? 1e9) - (b.effectivePrice ?? 1e9) },
  "price-desc": { label: "Price: high to low", fn: (a, b) => (b.effectivePrice ?? -1) - (a.effectivePrice ?? -1) },
  name: { label: "Name", fn: (a, b) => a.name.localeCompare(b.name) },
};

/* ---------- Home ---------- */

export function homeView(data) {
  const hasTalk = data.bats.some((b) => b.mentions > 0);
  const topTalk = hasTalk
    ? uniqueByFamily([...data.bats].sort(SORTS.talked.fn)).slice(0, 6)
    : data.bats.filter((b) => b.year === 2027).slice(0, 6);
  const brands = new Set(data.bats.map((b) => b.brand)).size;

  return {
    title: "Barrel Talk",
    html: `
    <section class="hero">
      <p class="eyebrow">${data.bats.length} slowpitch bats · ${brands} brands · USSSA, USA, NSA, ISA, senior</p>
      <h1 class="h1">Find the right slowpitch bat</h1>
      <p class="lede">Specs for every current bat, plus what players say about them on Reddit, forums, Facebook groups and YouTube. All in one place.</p>
      <form class="searchbar" id="home-search" role="search">
        <label class="sr" for="home-q" hidden>Search bats</label>
        <input class="input" id="home-q" type="search" placeholder="Try “Freak”, “Ronin” or “endload 13”" autocomplete="off">
        <button class="btn primary" type="submit">Search</button>
      </form>
    </section>

    <section class="section">
      <div class="section-head"><h2 class="h2">Where do you play?</h2><span class="muted small">Your league decides which stamp you need.</span></div>
      <div class="league-grid">
        ${LEAGUES.map((l) => {
          const n = data.bats.filter((b) => b.stamps.includes(l.id)).length;
          return `<button type="button" class="league-tile" data-league="${l.id}"><strong>${esc(l.name)}</strong><span>${esc(l.hint)}</span><span class="mono">${n} bats</span></button>`;
        }).join("")}
        <button type="button" class="league-tile" data-league="DUAL"><strong>Both</strong><span>Dual stamp: legal in USA and USSSA</span><span class="mono">${data.bats.filter((b) => b.dual).length} bats</span></button>
      </div>
    </section>

    <section class="section">
      <div class="split">
        <div class="feature">
          <h2 class="h2">Not sure what to get?</h2>
          <p class="muted">Answer five quick questions about your league, swing and budget. You get a short list with the reasons each bat fits.</p>
          <p><a class="btn primary" href="#finder">Start the Bat Finder</a></p>
        </div>
        <div class="feature">
          <h2 class="h2">Know the basics</h2>
          <p class="muted">Stamps, end-load vs balanced, one-piece vs two-piece, break-in and the cold-weather rule. Each one in a minute.</p>
          <p><a class="btn" href="#guide">Read the guide</a></p>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="h2">${hasTalk ? "Most talked about" : "New for 2027"}</h2>
        <a href="#bats" data-sort="${hasTalk ? "talked" : "newest"}">See all bats</a>
      </div>
      <ul class="bat-list">${topTalk.map((b) => batRowHTML(b)).join("")}</ul>
    </section>`,
    mount(root, nav) {
      root.querySelector("#home-search").addEventListener("submit", (e) => {
        e.preventDefault();
        setFilters({ q: root.querySelector("#home-q").value.trim() });
        nav("bats");
      });
      root.querySelectorAll("[data-league]").forEach((btn) =>
        btn.addEventListener("click", () => {
          const l = btn.dataset.league;
          setFilters(l === "DUAL" ? { dualOnly: true } : { leagues: [l] });
          nav("bats");
        })
      );
      root.querySelector("[data-sort]")?.addEventListener("click", (e) => {
        setFilters({ sort: e.currentTarget.dataset.sort });
      });
    },
  };
}

function uniqueByFamily(list) {
  const seen = new Set();
  return list.filter((b) => (seen.has(b.family) ? false : seen.add(b.family)));
}

/* ---------- Browse ---------- */

export function listView(data) {
  const hasTalk = data.bats.some((b) => b.mentions > 0);
  if (!filters.sort) filters.sort = hasTalk ? "talked" : "newest";
  const brands = [...new Set(data.bats.map((b) => b.brand))].sort();
  const years = [...new Set(data.bats.map((b) => String(b.year)))].sort().reverse();
  const prices = data.bats.map((b) => b.effectivePrice).filter((x) => x != null);
  const maxP = Math.ceil(Math.max(...prices) / 25) * 25;
  const minP = Math.floor(Math.min(...prices) / 25) * 25;

  const groups = [
    { key: "leagues", title: "Stamp", options: LEAGUES.map((l) => ({ v: l.id, label: l.name })), test: (b, v) => b.stamps.includes(v) },
    { key: "brands", title: "Brand", options: brands.map((x) => ({ v: x, label: x })), test: (b, v) => b.brand === v },
    { key: "loads", title: "Weight distribution", options: Object.entries(LOAD).map(([v, label]) => ({ v, label })), test: (b, v) => b.load === v },
    { key: "builds", title: "Construction", options: Object.entries(BUILD).map(([v, label]) => ({ v, label })), test: (b, v) => b.build === v },
    { key: "materials", title: "Material", options: Object.entries(MATERIAL).filter(([v]) => data.bats.some((b) => b.material === v)).map(([v, label]) => ({ v, label })), test: (b, v) => b.material === v },
    { key: "barrels", title: "Barrel length", options: BARRELS.map((x) => ({ v: x.id, label: x.label })), test: (b, v) => b.barrel && BARRELS.find((x) => x.id === v).test(b.barrel) },
    { key: "years", title: "Model year", options: years.map((y) => ({ v: y, label: y })), test: (b, v) => String(b.year) === v },
  ];

  return {
    title: "All bats · Barrel Talk",
    html: `
    <div class="browse">
      <aside class="filters collapsed" id="filters" aria-label="Filters">
        <div class="filter-group">
          <label class="field" for="f-q"><span class="eyebrow">Search</span>
          <input class="input" id="f-q" type="search" placeholder="Model, brand, SKU" value="${esc(filters.q)}" autocomplete="off"></label>
        </div>
        <div class="filter-group">
          <label class="check"><input type="checkbox" id="f-dual" ${filters.dualOnly ? "checked" : ""}> Dual stamp only (USA + USSSA)</label>
        </div>
        ${groups
          .map(
            (g) => `<div class="filter-group" data-group="${g.key}">
            <h3>${esc(g.title)}</h3>
            ${g.options
              .map(
                (o) => `<label class="check"><input type="checkbox" data-key="${g.key}" value="${esc(o.v)}" ${filters[g.key].includes(o.v) ? "checked" : ""}> ${esc(o.label)} <span class="n" data-count="${g.key}:${esc(o.v)}"></span></label>`
              )
              .join("")}
          </div>`
          )
          .join("")}
        ${g_leagueNote()}
        <div class="filter-group">
          <h3>Max price</h3>
          <input type="range" id="f-price" min="${minP}" max="${maxP}" step="25" value="${filters.maxPrice ?? maxP}" aria-label="Maximum price">
          <div class="range-row"><span>${money(minP)}</span><span id="f-price-label" class="mono">${filters.maxPrice ? "Up to " + money(filters.maxPrice) : "Any price"}</span></div>
        </div>
        <button class="btn sm" type="button" id="f-reset">Clear all filters</button>
      </aside>
      <section aria-label="Results">
        <div class="results-head">
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn sm filter-toggle" type="button" id="f-toggle" aria-controls="filters" aria-expanded="false">Filters</button>
            <h1 class="h2" id="result-count" aria-live="polite"></h1>
          </div>
          <label class="small muted" for="f-sort">Sort
            <select class="select" id="f-sort">${Object.entries(SORTS)
              .map(([k, s]) => `<option value="${k}" ${filters.sort === k ? "selected" : ""}>${s.label}</option>`)
              .join("")}</select>
          </label>
        </div>
        <div class="active-filters" id="active"></div>
        <ul class="bat-list" id="results"></ul>
      </section>
    </div>`,
    mount(root, nav, refreshButtons) {
      const results = root.querySelector("#results");
      const count = root.querySelector("#result-count");
      const active = root.querySelector("#active");
      const panel = root.querySelector("#filters");
      const toggle = root.querySelector("#f-toggle");
      if (window.matchMedia("(min-width: 761px)").matches) panel.classList.remove("collapsed");

      const labelFor = (key, v) => groups.find((g) => g.key === key)?.options.find((o) => o.v === v)?.label || v;

      function render() {
        store.setFilters(filters);
        const list = data.bats.filter((b) => matches(b, filters)).sort(SORTS[filters.sort].fn);
        count.textContent = `${list.length} bat${list.length === 1 ? "" : "s"}`;
        results.innerHTML = list.length
          ? list.map((b) => batRowHTML(b)).join("")
          : `<li class="empty"><p>No bats match all of those filters.</p><button class="btn" type="button" id="empty-reset">Clear filters</button></li>`;
        results.querySelector("#empty-reset")?.addEventListener("click", reset);

        for (const g of groups) {
          for (const o of g.options) {
            const n = data.bats.filter((b) => matches(b, filters, g.key) && g.test(b, o.v)).length;
            const el = root.querySelector(`[data-count="${g.key}:${CSS.escape(o.v)}"]`);
            if (el) el.textContent = n;
          }
        }

        const chips = [];
        if (filters.q) chips.push({ key: "q", label: `“${filters.q}”` });
        if (filters.dualOnly) chips.push({ key: "dualOnly", label: "Dual stamp" });
        for (const g of groups) for (const v of filters[g.key]) chips.push({ key: g.key, v, label: labelFor(g.key, v) });
        if (filters.maxPrice != null) chips.push({ key: "maxPrice", label: `Up to ${money(filters.maxPrice)}` });
        active.innerHTML = chips
          .map((c) => `<button type="button" class="chip" data-chip="${esc(c.key)}" data-v="${esc(c.v ?? "")}" aria-label="Remove filter ${esc(c.label)}">${esc(c.label)} ×</button>`)
          .join("");
        active.hidden = !chips.length;
        refreshButtons();
      }

      function reset() {
        const sort = filters.sort;
        filters = { ...emptyFilters(), sort };
        root.querySelectorAll("input[type=checkbox]").forEach((c) => (c.checked = false));
        root.querySelector("#f-q").value = "";
        const range = root.querySelector("#f-price");
        range.value = range.max;
        root.querySelector("#f-price-label").textContent = "Any price";
        render();
      }

      root.querySelector("#f-q").addEventListener("input", (e) => {
        filters.q = e.target.value.trim();
        render();
      });
      root.querySelector("#f-dual").addEventListener("change", (e) => {
        filters.dualOnly = e.target.checked;
        render();
      });
      root.querySelectorAll("input[data-key]").forEach((c) =>
        c.addEventListener("change", () => {
          const key = c.dataset.key;
          filters[key] = c.checked ? [...filters[key], c.value] : filters[key].filter((x) => x !== c.value);
          render();
        })
      );
      const range = root.querySelector("#f-price");
      range.addEventListener("input", () => {
        const v = Number(range.value);
        filters.maxPrice = v >= Number(range.max) ? null : v;
        root.querySelector("#f-price-label").textContent = filters.maxPrice ? "Up to " + money(filters.maxPrice) : "Any price";
        render();
      });
      root.querySelector("#f-sort").addEventListener("change", (e) => {
        filters.sort = e.target.value;
        render();
      });
      root.querySelector("#f-reset").addEventListener("click", reset);
      toggle.addEventListener("click", () => {
        const open = panel.classList.toggle("collapsed") === false;
        toggle.setAttribute("aria-expanded", String(open));
      });
      active.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-chip]");
        if (!chip) return;
        const { chip: key, v } = chip.dataset;
        if (key === "q") {
          filters.q = "";
          root.querySelector("#f-q").value = "";
        } else if (key === "dualOnly") {
          filters.dualOnly = false;
          root.querySelector("#f-dual").checked = false;
        } else if (key === "maxPrice") {
          filters.maxPrice = null;
          range.value = range.max;
          root.querySelector("#f-price-label").textContent = "Any price";
        } else {
          filters[key] = filters[key].filter((x) => x !== v);
          const box = root.querySelector(`input[data-key="${key}"][value="${CSS.escape(v)}"]`);
          if (box) box.checked = false;
        }
        render();
      });
      render();
    },
  };
}

function g_leagueNote() {
  return `<p class="small muted">NSA and ISA accept many bats stamped by other bodies. These filters show the logos printed on the barrel, so check your league's rules too.</p>`;
}

/* ---------- Bat detail ---------- */

function fitNotes(bat) {
  const out = [];
  if (bat.load === "endload") out.push(["", "Built for power hitters. Extra weight at the end of the barrel carries through the zone, at the cost of a slower swing."]);
  if (bat.load === "heavy") out.push(["", "Heaviest swing weight. For strong hitters who already square the ball up."]);
  if (bat.load === "balanced") out.push(["", "Balanced swing for contact and line-drive hitters, or anyone who wants better bat control."]);
  if (bat.build === "1pc") out.push(["", "One-piece: stiff, with more feedback. Mis-hits sting more."]);
  if (bat.build === "2pc") out.push(["", "Two-piece: the joint adds flex and soaks up sting on mis-hits."]);
  if (bat.material === "composite") out.push(["", "Composite: plan on a break-in period, and keep it out of games below about 60°F because cold composite cracks more easily."]);
  if (bat.material === "alloy") out.push(["", "Alloy: no break-in, fine in the cold and rarely cracks. Less pop than a broken-in composite."]);
  if (bat.material === "wood-composite") out.push(["", "Wood composite: very durable. Good for practice, cold days and wood-bat events. The least pop."]);
  if (bat.dual) out.push(["", "Dual stamp, so it is legal in both USA and USSSA play."]);
  else if (bat.stamps.length === 1 && bat.stamps[0] === "USSSA") out.push(["warn", "USSSA only. Not legal in USA Softball play."]);
  else if (bat.stamps.includes("USA") && !bat.stamps.includes("USSSA")) out.push(["warn", "USA stamp only. Check with your league before using it in USSSA play."]);
  if (bat.stamps.includes("SSUSA") && !bat.stamps.includes("USA") && !bat.stamps.includes("USSSA")) out.push(["warn", "Senior stamp only. Not legal in USA or USSSA adult leagues."]);
  return out;
}

function searchQuery(bat) {
  const fam = (bat.familyInfo?.name || bat.model).replace(/\(.*?\)/g, "").split("/")[0].trim();
  return `${bat.brand === "Louisville Slugger" ? "Louisville" : bat.brand} ${fam}`;
}

function conversationLinks(bat) {
  const q = searchQuery(bat);
  const enc = encodeURIComponent;
  return [
    ["Reddit", `https://www.reddit.com/search/?q=${enc(q + " slowpitch")}`, "r/Softball, r/slowpitch"],
    ["Facebook groups", `https://www.facebook.com/search/posts/?q=${enc(q + " bat")}`, "Sign-in required"],
    ["SoftballFans forum", `https://www.google.com/search?q=${enc("site:forums.softballfans.com " + q)}`, "Via Google"],
    ["YouTube reviews", `https://www.youtube.com/results?search_query=${enc(q + " slowpitch bat review")}`, "Hitting videos"],
  ];
}

function priceLinks(bat) {
  const q = encodeURIComponent(`${bat.year} ${bat.name} ${bat.stamps.includes("SSUSA") ? "senior" : bat.stamps[0]} slowpitch`);
  const links = [
    ["Compare prices", `https://www.google.com/search?tbm=shop&q=${q}`, "Google Shopping"],
    ["New and used", `https://www.ebay.com/sch/i.html?_nkw=${q}`, "eBay"],
    ["Used", `https://sidelineswap.com/search?q=${encodeURIComponent(bat.name)}`, "SidelineSwap"],
  ];
  if (bat.source) links.push(["Listing we used", bat.source, new URL(bat.source).hostname.replace(/^www\./, "")]);
  return links;
}

function linkList(rows) {
  return `<ul class="link-list">${rows
    .map(([label, href, note]) => `<li><a href="${esc(href)}" target="_blank" rel="noopener noreferrer"><b>${esc(label)} ${icons.external}</b><span>${esc(note)}</span></a></li>`)
    .join("")}</ul>`;
}

function verdict(t) {
  if (!t || !t.n) return null;
  const ratio = t.net / t.n;
  if (ratio > 0.25) return ["good", "Mostly positive"];
  if (ratio < -0.25) return ["bad", "Mostly negative"];
  return ["mixed", "Mixed"];
}

function communityHTML(bat, data) {
  const talk = bat.talk;
  const fam = bat.familyInfo;
  const famName = fam ? `${bat.brand} ${fam.name}` : bat.name;
  const starter = fam?.notes?.length
    ? `<div class="starter">
        <h3 class="h3">${talk?.mentions ? "Quick notes" : "Starter notes"}</h3>
        <ul>${fam.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
        <p class="notice">Starter notes are AI-written summaries of common talking points, not quotes from players. Posts collected by the aggregator replace them. <a href="#about">How this works</a></p>
      </div>`
    : "";

  if (!talk || !talk.mentions) {
    return `<div class="block" id="talk">
      <h2 class="h2">What players say</h2>
      <p class="muted">No posts about the ${esc(famName)} have been collected yet. The aggregator checks Reddit, forums, YouTube and imported Facebook posts every week.</p>
      ${starter}
      <h3 class="h3">Read the conversation yourself</h3>
      ${linkList(conversationLinks(bat))}
    </div>`;
  }

  const total = talk.positive + talk.mixed + talk.negative || 1;
  const pct = (n) => Math.round((n / total) * 100);
  const sourceLine = Object.entries(talk.sources || {})
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${esc(s)} ${n}`)
    .join(" · ");
  const topicCells = Object.entries(TOPICS)
    .map(([k, label]) => {
      const t = talk.topics?.[k];
      const v = verdict(t);
      if (!v) return "";
      return `<div class="topic"><strong>${esc(label)}</strong><span class="verdict ${v[0]}">${v[1]}</span><span class="small muted">${t.n} mention${t.n === 1 ? "" : "s"}</span></div>`;
    })
    .join("");

  return `<div class="block" id="talk">
    <div class="section-head"><h2 class="h2">What players say</h2><span class="small muted">About the ${esc(famName)} line · updated ${esc(formatDate(data.community.generatedAt))}</span></div>
    <div class="score-row">
      ${talk.mentions >= MIN_MENTIONS_FOR_SCORE ? `<div class="score" title="Community score out of 100">${talk.score}</div>` : ""}
      <div style="display:grid;gap:8px;flex:1;min-width:220px">
        <div class="meter" role="img" aria-label="${pct(talk.positive)}% positive, ${pct(talk.mixed)}% mixed, ${pct(talk.negative)}% negative">
          <i class="pos" style="width:${pct(talk.positive)}%"></i><i class="mix" style="width:${pct(talk.mixed)}%"></i><i class="neg" style="width:${pct(talk.negative)}%"></i>
        </div>
        <div class="legend"><span class="pos">${talk.positive} positive</span><span>${talk.mixed} mixed</span><span class="neg">${talk.negative} negative</span></div>
        <p class="small muted">${talk.mentions} posts and comments${sourceLine ? ": " + sourceLine : ""}</p>
      </div>
    </div>
    ${topicCells ? `<div class="topics">${topicCells}</div>` : ""}
    <div class="tabs" role="group" aria-label="Filter posts">
      <button class="chip" type="button" data-tone="all" aria-pressed="true">All</button>
      <button class="chip" type="button" data-tone="good" aria-pressed="false">Positive</button>
      <button class="chip" type="button" data-tone="bad" aria-pressed="false">Negative</button>
    </div>
    <ul class="quotes" id="quotes">
      ${(talk.quotes || [])
        .map(
          (q) => `<li class="quote" data-tone="${esc(q.tone)}">
          <blockquote>${esc(q.text)}</blockquote>
          <footer><span class="tone ${esc(q.tone)}">${toneLabel(q.tone)}</span><span>${esc(q.source)}</span>${q.date ? `<span>${esc(formatDate(q.date))}</span>` : ""}${q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener noreferrer">Read the thread ${icons.external}</a>` : ""}</footer>
        </li>`
        )
        .join("")}
    </ul>
    <p class="notice">Posts are matched to the whole ${esc(famName)} line, so some talk about other years or versions. Tone and topics are scored automatically and can miss sarcasm.</p>
    ${starter}
    <h3 class="h3">Read more</h3>
    ${linkList(conversationLinks(bat))}
  </div>`;
}

export function batView(data, id) {
  const bat = data.byId.get(id);
  if (!bat) return notFoundView();
  const siblings = data.bats.filter((b) => b.family === bat.family && b.id !== bat.id);
  const similar = data.bats
    .filter((b) => b.family !== bat.family && b.load === bat.load && b.stamps.some((s) => bat.stamps.includes(s)))
    .sort((a, b) => Math.abs((a.effectivePrice ?? 0) - (bat.effectivePrice ?? 0)) - Math.abs((b.effectivePrice ?? 0) - (bat.effectivePrice ?? 0)) || b.mentions - a.mentions)
    .slice(0, 5);

  const specs = [
    ["Stamps", bat.stamps.map((s) => STAMPS[s]?.long || s).join(", ")],
    ["Model year", bat.year],
    ["Construction", BUILD[bat.build]],
    ["Material", MATERIAL[bat.material] || "Not listed"],
    ["Weight distribution", bat.load ? LOAD[bat.load] + (bat.loadName ? ` (${bat.loadName})` : "") : "Not listed"],
    ["Barrel length", bat.barrel ? `${bat.barrel}"` : "Not listed"],
    ["Length", '34"'],
    ["Weights", bat.weights.map((w) => `${w} oz`).join(", ")],
    ["Barrel diameter", '2¼"'],
    ["List price", bat.price != null ? `${bat.priceApprox ? "about " : ""}${money(bat.price)}${bat.salePrice ? ` (seen on sale for ${money(bat.salePrice)})` : ""}` : "Not listed"],
  ];
  if (bat.sku) specs.push(["Model number", bat.sku]);

  const mini = (list) =>
    `<ul class="mini-list">${list
      .map((b) => `<li><a href="#bat-${esc(b.id)}"><strong>${esc(b.name)}</strong><span>${esc([b.year, ...b.stamps, BUILD[b.build], b.barrel ? b.barrel + '"' : ""].filter(Boolean).join(" · "))} · ${esc(money(b.effectivePrice) || "Check price")}</span></a></li>`)
      .join("")}</ul>`;

  return {
    title: `${bat.name} · Barrel Talk`,
    html: `
    <a class="back" href="#bats">← All bats</a>
    <header class="bat-head">
      <p class="eyebrow">${esc(bat.brand)} · ${esc(bat.year)}</p>
      <h1 class="h1">${esc(bat.model)}</h1>
      <div class="bat-meta">${stampsHTML(bat)}${specLine(bat)}</div>
      <div class="bat-actions">
        ${priceHTML(bat)}
        ${pulseHTML(bat)}
        <span style="flex:1"></span>
        <button class="btn sm" type="button" data-act="save" data-id="${esc(bat.id)}" aria-pressed="false">${icons.star} Save</button>
        <button class="btn sm" type="button" data-act="compare" data-id="${esc(bat.id)}" aria-pressed="false">${icons.compare} Compare</button>
      </div>
    </header>
    <div class="bat-layout">
      <div class="bat-main">
        <div class="block">
          <h2 class="h2">Who it fits</h2>
          <ul class="fit-list">${fitNotes(bat).map(([cls, t]) => `<li class="${cls}">${esc(t)}</li>`).join("")}</ul>
        </div>
        ${communityHTML(bat, data)}
        <div class="block" id="reviews">
          <div class="section-head"><h2 class="h2">Your reviews</h2><span class="small muted">${reviewsBackend().shared ? "Shared with everyone" : "Saved on this device"}</span></div>
          <div id="review-root"></div>
        </div>
      </div>
      <aside class="aside">
        <div>
          <h2 class="eyebrow" style="margin-bottom:8px">Specs</h2>
          <dl class="specs">${specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        </div>
        <div class="panel">
          <h2 class="eyebrow">Shop around</h2>
          ${linkList(priceLinks(bat))}
        </div>
      </aside>
      <div class="related">
        ${siblings.length ? `<div><h2 class="eyebrow">Other ${esc(bat.familyInfo?.name || "")} versions</h2>${mini(siblings.slice(0, 6))}</div>` : ""}
        ${similar.length ? `<div><h2 class="eyebrow">Similar bats</h2>${mini(similar)}</div>` : ""}
      </div>
    </div>`,
    mount(root, nav, refreshButtons) {
      refreshButtons();
      root.querySelectorAll("[data-tone]").forEach((btn) => {
        if (btn.tagName !== "BUTTON") return;
        btn.addEventListener("click", () => {
          const tone = btn.dataset.tone;
          root.querySelectorAll("button[data-tone]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
          root.querySelectorAll(".quote").forEach((q) => (q.hidden = tone !== "all" && q.dataset.tone !== tone));
        });
      });
      renderReviews(root.querySelector("#review-root"), bat);
    },
  };
}

/* ---------- Compare ---------- */

export function compareView(data) {
  const bats = store.compare.map((id) => data.byId.get(id)).filter(Boolean);
  if (!bats.length) {
    return {
      title: "Compare · Barrel Talk",
      html: `<h1 class="h1">Compare</h1>
      <div class="empty"><p>Add up to four bats with the compare button ${icons.compare} on any bat, then come back here to see them side by side.</p><a class="btn primary" href="#bats">Browse bats</a></div>`,
    };
  }
  const rows = [
    ["Price", (b) => money(b.effectivePrice) || "—"],
    ["Stamps", (b) => b.stamps.join(" + ")],
    ["Year", (b) => b.year],
    ["Construction", (b) => BUILD[b.build]],
    ["Material", (b) => MATERIAL[b.material] || "—"],
    ["Weight distribution", (b) => (b.load ? LOAD[b.load] : "—")],
    ["Load detail", (b) => b.loadName || "—"],
    ["Barrel", (b) => (b.barrel ? `${b.barrel}"` : "—")],
    ["Weights", (b) => b.weights.join(", ") + " oz"],
    ["Community score", (b) => (b.score != null ? b.score : "Not enough posts")],
    ["Posts collected", (b) => b.mentions],
  ];
  return {
    title: "Compare · Barrel Talk",
    html: `<div class="section-head" style="margin-bottom:20px"><h1 class="h1">Compare</h1><button class="btn sm ghost" type="button" id="clear-compare">Clear all</button></div>
    <div class="table-scroll">
      <table class="compare">
        <thead><tr><th scope="col"><span class="sr" hidden>Spec</span></th>${bats
          .map(
            (b) => `<th scope="col"><div style="display:grid;gap:6px"><span class="bat-brand">${esc(b.brand)}</span><a class="bat-name" href="#bat-${esc(b.id)}">${esc(b.model)}</a><button class="btn sm ghost" style="justify-self:start;padding-left:0" type="button" data-remove="${esc(b.id)}">Remove</button></div></th>`
          )
          .join("")}</tr></thead>
        <tbody>${rows
          .map(([label, fn]) => {
            const vals = bats.map((b) => String(fn(b)));
            const differs = bats.length > 1 && new Set(vals).size > 1;
            return `<tr><th scope="row">${esc(label)}</th>${vals.map((v) => `<td class="${differs ? "diff" : ""}">${esc(v)}</td>`).join("")}</tr>`;
          })
          .join("")}</tbody>
      </table>
    </div>
    <p class="small muted" style="margin-top:12px">Highlighted rows are where the bats differ.</p>`,
    mount(root, nav) {
      root.querySelector("#clear-compare").addEventListener("click", () => {
        store.clearCompare();
        nav("compare", true);
      });
      root.querySelectorAll("[data-remove]").forEach((btn) =>
        btn.addEventListener("click", () => {
          store.toggleCompare(btn.dataset.remove);
          nav("compare", true);
        })
      );
    },
  };
}

/* ---------- Saved ---------- */

export function savedView(data) {
  const bats = store.saved.map((id) => data.byId.get(id)).filter(Boolean);
  return {
    title: "Saved · Barrel Talk",
    html: `<h1 class="h1" style="margin-bottom:20px">Saved bats</h1>
    ${
      bats.length
        ? `<ul class="bat-list" style="border-top:1px solid var(--ink)">${bats.map((b) => batRowHTML(b)).join("")}</ul>`
        : `<div class="empty"><p>Tap the star ${icons.star} on any bat to keep it here. Saved bats stay on this device.</p><a class="btn primary" href="#bats">Browse bats</a></div>`
    }`,
    mount(root, nav, refreshButtons) {
      refreshButtons();
    },
  };
}

/* ---------- Guide ---------- */

export function guideView() {
  const sections = [
    ["stamps", "Stamps: which bat is legal", `
      <p>Every slowpitch bat carries a certification stamp. Your league's sanctioning body decides which stamp you need, and an umpire can pull a bat without it.</p>
      <dl class="kv">
        <dt>USSSA</dt><dd>The hotter standard, used in most tournament play. Current bats carry the 240 stamp (a 240 lb compression limit). Older thumbprint-stamp bats are no longer legal in USSSA tournaments.</dd>
        <dt>USA</dt><dd>USA Softball, formerly ASA. A lower performance limit, common in city, church and rec leagues. Look for the USA Softball certification mark.</dd>
        <dt>Dual stamp</dt><dd>Carries both USA and USSSA marks, so it is legal in both. These bats are built to the stricter USA limit.</dd>
        <dt>NSA / ISA</dt><dd>Smaller associations. Many accept bats with other stamps, so check your league's rules.</dd>
        <dt>SSUSA</dt><dd>Senior Softball USA, for 50+ play. Senior bats can be hotter than USA bats but are not legal in adult USA or USSSA leagues.</dd>
      </dl>`],
    ["load", "End-loaded or balanced", `
      <p>Weight distribution matters more than the number on the knob. Two 26 oz bats can swing very differently.</p>
      <ul>
        <li><strong>Balanced:</strong> weight is spread evenly. Quicker through the zone and easier to control. Good for contact and line-drive hitters.</li>
        <li><strong>End-loaded (about ½ oz):</strong> extra weight near the end cap gives more momentum at contact. The common choice for power hitters. Brand names include Loaded, Maxload, XL and Ya-Ya Load.</li>
        <li><strong>Heavy end-load (about 1 oz):</strong> names like Supermax, XXL, Powerload and Buttload. Only for strong hitters, because a slow swing loses the benefit.</li>
      </ul>`],
    ["pieces", "One-piece or two-piece", `
      <ul>
        <li><strong>One-piece:</strong> stiff, so more energy goes into the ball on a squared-up hit. You feel mis-hits in your hands.</li>
        <li><strong>Two-piece:</strong> the handle and barrel join at a connection that flexes. This adds whip and cuts sting, and is the most common choice.</li>
      </ul>`],
    ["material", "Composite, alloy or wood composite", `
      <ul>
        <li><strong>Composite:</strong> the most pop once broken in. It needs a break-in and does not like the cold.</li>
        <li><strong>Alloy:</strong> hot from day one, cheaper and much harder to crack. Less pop than a broken-in composite. A smart backup or first bat.</li>
        <li><strong>Wood composite:</strong> nearly indestructible. Use it for practice, cold weather and wood-bat events.</li>
      </ul>`],
    ["size", "Picking a weight", `
      <p>Almost every slowpitch bat is 34 inches. The choice is weight, from 25 to 28 oz in most models.</p>
      <ul>
        <li>Choose a weight you can swing hard for a whole doubleheader. Bat speed beats bat mass for most hitters.</li>
        <li>If you are between weights, or the bat is end-loaded, go lighter.</li>
        <li>Most adult players use 26 or 27 oz. Strong power hitters may go to 28 oz.</li>
      </ul>`],
    ["breakin", "Break-in", `
      <p>New composite bats get better as the fibers loosen. Plans differ by brand, but most players use something like this:</p>
      <ul>
        <li>Start with 150 to 200 hits off a tee or soft toss, at about half speed and then three-quarter speed.</li>
        <li>Turn the bat a quarter turn after every swing so the barrel breaks in evenly.</li>
        <li>Use regular game balls. Avoid heavy, waterlogged or cheap practice balls.</li>
      </ul>`],
    ["care", "Care and warranty", `
      <ul>
        <li>Don't use a composite below about 60°F. Most cracks happen in the cold.</li>
        <li>Don't share your gamer with the whole team. More hitters means more mis-hits on the end cap.</li>
        <li>Store it indoors. A hot trunk or a cold garage both shorten its life.</li>
        <li>Keep your receipt. Most bats carry a one-year warranty against cracks. Rolled or shaved bats void it.</li>
        <li>Rolling, shaving or other altering is illegal in every sanctioned league.</li>
      </ul>`],
  ];
  return {
    title: "Buying guide · Barrel Talk",
    html: `<h1 class="h1" style="margin-bottom:8px">Buying guide</h1>
    <p class="lede" style="margin-bottom:28px">Everything you need to know before spending $300 on a bat.</p>
    <div class="guide">
      <nav class="toc" aria-label="Guide sections">${sections.map(([id, t]) => `<a href="#guide" data-jump="${id}">${esc(t)}</a>`).join("")}</nav>
      <div class="guide-body">${sections.map(([id, t, body]) => `<section id="g-${id}"><h2 class="h2">${esc(t)}</h2><div class="prose">${body}</div></section>`).join("")}</div>
    </div>`,
    mount(root) {
      root.querySelectorAll("[data-jump]").forEach((a) =>
        a.addEventListener("click", (e) => {
          e.preventDefault();
          root.querySelector(`#g-${a.dataset.jump}`).scrollIntoView({ behavior: "smooth", block: "start" });
        })
      );
    },
  };
}

/* ---------- About the data ---------- */

export function aboutView(data) {
  const c = data.community;
  const counted = Object.values(c.families || {}).reduce((n, f) => n + (f.mentions || 0), 0);
  const sourceRows = Object.entries(c.sources || {})
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === "object" ? Object.entries(v).map(([a, b]) => `${b} ${a}`).join(", ") : v)}</dd>`)
    .join("");
  return {
    title: "Where the reviews come from · Barrel Talk",
    html: `<div class="prose">
      <h1 class="h1">Where the reviews come from</h1>
      <p class="lede">There are very few real bat reviews online, but players talk about bats all the time. Barrel Talk collects that talk and attaches it to the right bats.</p>
      <h2 class="h2">What gets collected</h2>
      <ul>
        <li><strong>Reddit:</strong> posts and comments from r/Softball, r/slowpitch and related subreddits, through Reddit's API.</li>
        <li><strong>Forums:</strong> SoftballFans and any other forum with an RSS feed.</li>
        <li><strong>YouTube:</strong> comments on bat review and hitting videos.</li>
        <li><strong>Facebook groups:</strong> Facebook has no public API for groups, so posts are added by pasting them into an import file. Only add posts from groups where members expect posts to be shared.</li>
      </ul>
      <h2 class="h2">How it is scored</h2>
      <ul>
        <li>Every post is matched to a bat line by name, for example “Freak” or “Ronin”. Common words like “torch” or “mercy” only count when the post is clearly about bats.</li>
        <li>Each post gets a tone (positive, mixed or negative) from a word list tuned for softball talk. “Hot”, “mashing” and “pop” count as positive. “Dead”, “cracked” and “sting” count as negative.</li>
        <li>Posts are also sorted by topic: pop, durability, break-in, feel, sound and value.</li>
        <li>The community score runs from 0 to 100. It only appears after ${MIN_MENTIONS_FOR_SCORE} posts and is pulled toward 50 until there is more data, so one angry post can't sink a bat.</li>
        <li>Quotes always link back to the original post. Usernames are not stored.</li>
      </ul>
      <h2 class="h2">Current data</h2>
      ${
        c.generatedAt
          ? `<p>Last collected ${esc(formatDate(c.generatedAt))}. ${counted} posts matched across ${Object.keys(c.families || {}).length} bat lines.</p>${sourceRows ? `<dl class="kv">${sourceRows}</dl>` : ""}`
          : `<p class="notice">No posts have been collected yet. Until the first run, each bat shows short starter notes (AI-written summaries, labeled as such) and links to search Reddit, Facebook, SoftballFans and YouTube yourself.</p>`
      }
      <h2 class="h2">Specs and prices</h2>
      <p>${esc(data.catalogNote)} Catalog updated ${esc(formatDate(data.catalogUpdated))}. Prices marked “~” are typical retail prices, not a quote.</p>
    </div>`,
  };
}

export function notFoundView() {
  return {
    title: "Not found · Barrel Talk",
    html: `<div class="empty"><h1 class="h1">That bat isn't here</h1><p>It may have been renamed or removed from the catalog.</p><a class="btn primary" href="#bats">Browse all bats</a></div>`,
  };
}

export { actionButtons };
