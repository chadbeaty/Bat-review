(function () {
  "use strict";

  const shop = window.SHOP;
  const CART_KEY = "cd-cart";
  const $ = (id) => document.getElementById(id);
  const byId = (list, id) => list.find((item) => item.id === id);
  const allAddIns = shop.addInGroups.flatMap((group) => group.items);

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: shop.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  // Small DOM helper so user-entered text is always set as text, never HTML.
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (key === "text") node.textContent = value;
      else if (key === "style") Object.assign(node.style, value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    });
    (children || []).forEach((child) => child && node.append(child));
    return node;
  }

  function meter(level, max = 5) {
    const wrap = el("span", { className: "meter", role: "img", "aria-label": `Heat ${level} of ${max}` });
    for (let i = 1; i <= max; i++) wrap.append(el("i", { className: i <= level ? "on" : "" }));
    return wrap;
  }

  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  // ---------- State ----------

  // Every bottle starts empty and fills as the customer chooses.
  const state = {
    pepper: null,
    base: null,
    almond: null,
    addIns: [],
    size: shop.sizes[0].id,
    label: "",
    qty: 1,
  };

  let cart = loadCart();

  function isValidItem(item) {
    return Boolean(
      item &&
      byId(shop.peppers, item.pepper) &&
      byId(shop.bases, item.base) &&
      byId(shop.almondStyles, item.almond) &&
      byId(shop.sizes, item.size) &&
      Array.isArray(item.addIns) &&
      item.addIns.every((id) => byId(allAddIns, id))
    );
  }

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY));
      // Drop saved bottles whose ingredients were since removed from config.js.
      return Array.isArray(saved) ? saved.filter(isValidItem) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
      // Storage can be unavailable (private mode); the cart still works for this visit.
    }
  }

  // Works for finished cart items and for the half-built bottle in the builder.
  function describe(item) {
    const pepper = byId(shop.peppers, item.pepper) || null;
    const base = byId(shop.bases, item.base) || null;
    const almond = byId(shop.almondStyles, item.almond) || null;
    const size = byId(shop.sizes, item.size);
    const addIns = item.addIns.map((id) => byId(allAddIns, id));
    const hasAlmonds = Boolean(almond && almond.ingredient);
    const price = (x) => (x ? x.price : 0);

    const second = hasAlmonds ? "Almond" : addIns.length ? addIns[0].name : almond ? "Classic" : "";
    const parts = [pepper, base, almond].concat(addIns).filter(Boolean).map((x) => x.ingredient).filter(Boolean);
    const title = item.label || (pepper ? `${pepper.name} ${second}`.trim() : "Your Sauce");

    return {
      title,
      pepper,
      base,
      almond,
      size,
      addIns,
      hasAlmonds,
      complete: Boolean(pepper && base && almond),
      ingredients: parts.length ? capitalize(parts.concat("sea salt").join(", ")) + "." : "Your ingredients will be listed here.",
      unitPrice: size.price + price(base) + price(almond) + addIns.reduce((sum, a) => sum + a.price, 0),
      recipe: [pepper && pepper.name, base && base.name, almond && (hasAlmonds ? `${almond.name} almonds` : "No almonds")]
        .concat(addIns.map((a) => a.name))
        .filter(Boolean)
        .join(" · "),
    };
  }

  // ---------- The bottle ----------
  // Each ingredient pours in as its own layer. Heights are in "units"; a full
  // recipe (pepper, base, almonds, 4 flavors) fills the bottle up into the neck.

  const UNITS = { pepper: 30, base: 22, almond: 14, addIn: 8 };
  const FILL_SCALE = 0.82;
  const BOTTLE_PATH = "M86 40H114V118C114 140 170 150 170 186V368Q170 388 150 388H50Q30 388 30 368V186C30 150 86 140 86 118Z";

  function layersFor(info) {
    const layers = [];
    if (info.pepper) layers.push({ key: "pepper", name: info.pepper.name, color: info.pepper.color, units: UNITS.pepper, texture: "seeds" });
    if (info.base) layers.push({ key: "base", name: info.base.name, color: info.base.color, units: UNITS.base, texture: "bubbles" });
    if (info.hasAlmonds) {
      layers.push({
        key: "almond",
        name: `${info.almond.name} almonds`,
        color: info.almond.color,
        units: UNITS.almond,
        texture: info.almond.id === "crunchy" ? "chunks" : "cream",
      });
    }
    info.addIns.forEach((a) => layers.push({ key: `addin-${a.id}`, name: a.name, color: a.color, units: UNITS.addIn, texture: "" }));
    return layers;
  }

  // The color the sauce will actually be once blended: a weighted average.
  function mixColor(layers) {
    const total = layers.reduce((sum, l) => sum + l.units, 0);
    if (!total) return "transparent";
    const rgb = [0, 0, 0];
    layers.forEach((l) => {
      const n = parseInt(l.color.slice(1), 16);
      [n >> 16, (n >> 8) & 255, n & 255].forEach((v, i) => (rgb[i] += (v * l.units) / total));
    });
    return `rgb(${rgb.map(Math.round).join(",")})`;
  }

  function buildVessel(node, withLabel) {
    node.innerHTML =
      '<div class="vessel-glass"><div class="vessel-fill"></div><div class="vessel-full"></div><div class="vessel-pour"></div></div>' +
      '<svg class="vessel-outline" viewBox="0 0 200 400" aria-hidden="true">' +
      `<path d="${BOTTLE_PATH}" fill="none" stroke="#2b2622" stroke-width="7" stroke-linejoin="round"/>` +
      '<path d="M46 196V352" stroke="#fff" stroke-opacity=".55" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="M98 60V104" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>' +
      '<rect x="80" y="2" width="40" height="40" rx="6" fill="#2b2622"/>' +
      '<path d="M88 10V34M96 10V34M104 10V34M112 10V34" stroke="#4a423c" stroke-width="3"/>' +
      '<rect x="82" y="46" width="36" height="9" rx="3" fill="#2b2622"/>' +
      "</svg>" +
      (withLabel ? PRODUCT_SHOT + FRONT_LABEL + BACK_LABEL : "");
    return { fill: node.querySelector(".vessel-fill"), pour: node.querySelector(".vessel-pour") };
  }

  // The front label exactly as it gets printed. Shown on the bottle in the
  // Label view, with a close-up copy beside it.
  const FRONT_LABEL =
    '<div class="front-label" aria-hidden="true"><div class="fl-body">' +
    '<svg class="fl-mark"><use href="#dad"/></svg>' +
    '<svg class="fl-wordmark"><use href="#wordmark"/></svg>' +
    '<span class="fl-kind">Hot Sauce</span>' +
    '<span class="fl-name"></span><span class="fl-heat"></span><span class="fl-net"></span>' +
    "</div></div>";

  const BACK_LABEL =
    '<div class="back-label" aria-hidden="true"><div class="bl-body">' +
    '<svg class="bl-wordmark"><use href="#wordmark"/></svg>' +
    '<p class="bl-ingredients"><b>Ingredients:</b> <span class="bl-list"></span></p>' +
    '<p class="bl-contains"></p>' +
    '<p class="bl-care">Refrigerate after opening. Shake well.</p>' +
    '<div class="bl-foot"><span class="bl-net"></span><span class="bl-batch"></span></div>' +
    "<p class=\"bl-made\">Made to order by Chaddy Daddy's</p>" +
    "</div></div>";

  // Finished view: glass shading, shine, a shrink band over the cap and a
  // shadow, so the bottle reads like the real thing on a shelf.
  const PRODUCT_SHOT =
    '<svg class="vessel-real" viewBox="0 0 200 400" aria-hidden="true"><defs>' +
    '<linearGradient id="rl-cyl" x1="0" x2="1"><stop offset="0" stop-opacity=".5"/><stop offset=".14" stop-opacity=".12"/>' +
    '<stop offset=".3" stop-color="#fff" stop-opacity=".25"/><stop offset=".42" stop-color="#fff" stop-opacity=".04"/>' +
    '<stop offset=".72" stop-opacity=".06"/><stop offset=".9" stop-opacity=".32"/><stop offset="1" stop-opacity=".55"/></linearGradient>' +
    '<linearGradient id="rl-cap" x1="0" x2="1"><stop offset="0" stop-color="#14110f"/><stop offset=".35" stop-color="#4d453f"/>' +
    '<stop offset=".6" stop-color="#2b2622"/><stop offset="1" stop-color="#0f0c0a"/></linearGradient>' +
    '<linearGradient id="rl-band" x1="0" x2="1"><stop offset="0" stop-color="#5e2416"/><stop offset=".35" stop-color="#b8553c"/>' +
    '<stop offset=".6" stop-color="#9e432e"/><stop offset="1" stop-color="#4a1c12"/></linearGradient>' +
    `<clipPath id="rl-clip"><path d="${BOTTLE_PATH}"/></clipPath></defs>` +
    '<g clip-path="url(#rl-clip)">' +
    '<rect x="30" y="140" width="140" height="250" fill="url(#rl-cyl)"/>' +
    '<rect x="86" y="40" width="28" height="110" fill="url(#rl-cyl)"/>' +
    '<rect x="49" y="196" width="10" height="170" rx="5" fill="#fff" opacity=".45"/>' +
    '<rect x="62" y="200" width="22" height="160" rx="11" fill="#fff" opacity=".1"/>' +
    '<rect x="91" y="70" width="4" height="60" rx="2" fill="#fff" opacity=".4"/>' +
    '<rect x="30" y="374" width="140" height="16" fill="#fff" opacity=".12"/>' +
    "</g>" +
    `<path d="${BOTTLE_PATH}" fill="none" stroke="#1b1714" stroke-opacity=".7" stroke-width="2.5"/>` +
    '<rect x="80" y="2" width="40" height="34" rx="5" fill="url(#rl-cap)"/>' +
    '<path d="M86 6V30M92 6V30M98 6V30M104 6V30M110 6V30M116 6V30" stroke="#000" stroke-opacity=".35" stroke-width="1.5"/>' +
    '<rect x="80" y="28" width="40" height="34" rx="3" fill="url(#rl-band)"/>' +
    '<path d="M81 45H119" stroke="#f2e6d6" stroke-opacity=".6" stroke-width="1.2" stroke-dasharray="2 2"/>' +
    '<path d="M84 32V58" stroke="#fff" stroke-opacity=".25" stroke-width="3" stroke-linecap="round"/>' +
    "</svg>";

  const bigVessel = buildVessel($("vessel"), true);
  const miniVessel = buildVessel($("mini-vessel"), false);
  $("label-zoom").innerHTML = FRONT_LABEL + BACK_LABEL;
  let lastLayers = new Map();
  let legendTimer;

  function syncLayers(fill, layers) {
    const wanted = new Set(layers.map((l) => l.key));
    fill.querySelectorAll(".layer").forEach((node) => {
      if (!wanted.has(node.dataset.key) && !node.classList.contains("leaving")) {
        node.classList.add("leaving");
        node.style.height = "0%";
        setTimeout(() => node.remove(), 700);
      }
    });
    layers.forEach((layer) => {
      let node = fill.querySelector(`.layer[data-key="${layer.key}"]:not(.leaving)`);
      if (!node) {
        node = el("div", { className: "layer" });
        node.dataset.key = layer.key;
        node.style.height = "0%";
        fill.append(node);
        void node.offsetHeight; // start the grow animation from empty
      } else {
        fill.append(node); // keep stacking order in step with the recipe
      }
      node.className = `layer ${layer.texture}`;
      node.style.setProperty("--c", layer.color);
      node.style.height = `${layer.units * FILL_SCALE}%`;
    });
  }

  // A stream of the new ingredient pours from the neck down to the surface.
  function pour(target, color, unitsAfter) {
    const surfaceFromTop = 100 - (3 + (87 * unitsAfter * FILL_SCALE) / 100);
    target.style.setProperty("--c", color);
    target.style.height = `${Math.max(surfaceFromTop - 10, 4)}%`;
    target.classList.remove("go");
    void target.offsetWidth;
    target.classList.add("go");
  }

  function renderLegend(layers) {
    const rowHeight = $("stage-row").getBoundingClientRect().height || 300;
    let cum = 0;
    let lastPx = -Infinity;
    const items = layers.map((layer) => {
      const mid = cum + (layer.units * FILL_SCALE) / 2;
      cum += layer.units * FILL_SCALE;
      // Bottom offset as a % of the row, nudged up so labels never overlap.
      let px = ((3 + (87 * mid) / 100) / 100) * rowHeight;
      px = Math.max(px, lastPx + 17);
      lastPx = px;
      return el("li", { style: { bottom: `${px}px` } }, [
        el("i", { style: { background: layer.color } }),
        document.createTextNode(layer.name),
      ]);
    });
    $("legend").replaceChildren(...items);
  }

  function renderBottle(info) {
    const layers = layersFor(info);
    let units = 0;
    layers.forEach((layer) => {
      units += layer.units;
      const before = lastLayers.get(layer.key);
      if (before !== layer.color) pour(bigVessel.pour, layer.color, units);
    });
    lastLayers = new Map(layers.map((l) => [l.key, l.color]));

    syncLayers(bigVessel.fill, layers);
    syncLayers(miniVessel.fill, layers);
    renderLegend(layers);
    clearTimeout(legendTimer);
    legendTimer = setTimeout(() => renderLegend(layers), 450); // after a size change settles

    const mix = mixColor(layers);
    [$("vessel"), $("mini-vessel")].forEach((v) => {
      v.style.setProperty("--mix", mix);
      v.style.setProperty("--scale", info.size.id === shop.sizes[0].id ? 0.88 : 1);
    });
    $("stage-row").style.setProperty("--scale", info.size.id === shop.sizes[0].id ? 0.88 : 1);
    document.querySelector('#view-switch [data-view="mixed"]').disabled = layers.length === 0;
    if (!layers.length && view === "mixed") setView("layers");

    document.querySelectorAll(".front-label").forEach((label) => {
      const name = label.querySelector(".fl-name");
      name.textContent = info.title;
      name.classList.toggle("long", info.title.length > 14);
      label.querySelector(".fl-heat").replaceChildren(meter(info.pepper ? info.pepper.heat : 0));
      label.querySelector(".fl-net").textContent = `${info.size.name} · ${info.size.volume}`;
      label.style.setProperty("--label-c", info.pepper ? info.pepper.color : "#2b2622");
    });
    document.querySelectorAll(".back-label").forEach((label) => {
      label.querySelector(".bl-list").textContent = info.ingredients;
      label.querySelector(".bl-contains").textContent = containsLine(info);
      label.querySelector(".bl-net").textContent = `Net ${info.size.name} (${info.size.volume})`;
      label.querySelector(".bl-batch").textContent = $("batch").textContent;
    });
    renderProfile(info);

    $("stage-hint").textContent = hintFor(info);

    const count = layers.length;
    $("mobile-count").textContent = count ? `${count} ingredient${count === 1 ? "" : "s"}` : "Empty bottle";
  }

  const containsLine = (info) =>
    info.hasAlmonds ? "Contains: tree nuts (almonds)." : "Made in a kitchen that handles tree nuts.";

  // ---------- Flavor profile ----------

  function profileFor(info) {
    const ids = [info.pepper, info.base, info.almond].concat(info.addIns).filter(Boolean).map((x) => x.id);
    const notes = { Heat: info.pepper ? info.pepper.heat : 0 };
    Object.entries(shop.tasteNotes).forEach(([note, points]) => {
      notes[note] = Math.min(5, ids.reduce((sum, id) => sum + (points[id] || 0), 0));
    });
    return notes;
  }

  function renderProfile(info) {
    const notes = profileFor(info);
    $("profile").replaceChildren(
      ...Object.entries(notes).map(([note, score]) => {
        const pips = el("dd", { "aria-label": `${score} of 5` });
        for (let i = 1; i <= 5; i++) pips.append(el("i", { className: i <= score ? "on" : "" }));
        return el("div", {}, [el("dt", { text: note }), pips]);
      })
    );
    const top = Object.entries(notes)
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([note]) => shop.pairings[note]);
    $("pairs").textContent = !info.pepper
      ? "Your flavor profile builds as you pick."
      : top.length > 1
        ? `Great on ${top[0]}. Also try it with ${top[1]}.`
        : `Great on ${top[0]}.`;
  }

  function hintFor(info) {
    if (view === "label" && side === "back") return "Your back label, as printed.";
    if (view === "label") return state.label ? "Your front label, as printed." : "Your front label. Name it in step 5.";
    if (!info.pepper) return "Pick a pepper to start filling your bottle.";
    if (!info.base) return "Now pour in a base.";
    if (!info.almond) return "Almonds or no almonds?";
    const left = shop.maxAddIns - info.addIns.length;
    return left ? `Add up to ${left} more flavor${left === 1 ? "" : "s"}, or add it to your order.` : "Full bottle. Ready when you are.";
  }

  // Three ways to look at the bottle: separate layers, shaken (the real
  // blended color), or shaken with the printed front label on it.
  let view = "layers";
  let side = "front";
  function setSide(next) {
    side = next;
    $("vessel").classList.toggle("back", next === "back");
    $("label-zoom").classList.toggle("back", next === "back");
    $("turn-btn").textContent = next === "back" ? "↻ Turn to the front" : "↻ Turn it around";
    $("stage-hint").textContent = hintFor(describe(state));
  }

  function setView(next) {
    view = next;
    $("turn-btn").hidden = next !== "label";
    if (next !== "label" && side !== "front") setSide("front");
    const blended = next !== "layers";
    $("vessel").classList.toggle("mixed", blended);
    $("mini-vessel").classList.toggle("mixed", blended);
    $("vessel").classList.toggle("labeled", next === "label");
    $("stage-row").classList.toggle("labeled", next === "label");
    $("legend").classList.toggle("dim", next === "mixed");
    document.querySelectorAll("#view-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === next)));
    $("stage-hint").textContent = hintFor(describe(state));
  }

  function shake() {
    [$("vessel"), $("mini-vessel")].forEach((v) => {
      v.classList.remove("shaking");
      void v.offsetWidth;
      v.classList.add("shaking");
    });
  }

  // ---------- Builder ----------

  function optionCard(name, value, opts) {
    const input = el("input", { type: "radio", name, value, checked: state[name] === value });
    const top = el("span", { className: "oc-top" }, [
      el("strong", { text: opts.title }),
      opts.aside || (opts.price ? el("span", { className: "oc-price", text: `+${money.format(opts.price)}` }) : null),
    ]);
    const card = el("span", { className: "option-card" }, [
      top,
      opts.note ? el("small", { text: opts.note }) : null,
      opts.meta ? el("span", { className: "oc-meta" }, opts.meta) : null,
    ]);
    return el("label", { className: "option" }, [input, card]);
  }

  function renderOptions() {
    $("pepper-options").replaceChildren(
      ...shop.peppers.map((p) =>
        optionCard("pepper", p.id, { title: p.name, note: p.note, meta: [meter(p.heat), document.createTextNode(`${p.shu} SHU`)] })
      )
    );
    $("base-options").replaceChildren(
      ...shop.bases.map((b) => optionCard("base", b.id, { title: b.name, note: b.note, price: b.price }))
    );
    $("almond-options").replaceChildren(
      ...shop.almondStyles.map((a) => optionCard("almond", a.id, { title: a.name, note: a.note, price: a.price }))
    );
    $("size-options").replaceChildren(
      ...shop.sizes.map((s) =>
        optionCard("size", s.id, { title: s.name, note: s.volume, aside: el("span", { className: "oc-price", text: money.format(s.price) }) })
      )
    );

    $("addin-options").replaceChildren(
      ...shop.addInGroups.map((group) =>
        el("div", { className: "flavor-group" }, [
          el("h4", { text: group.name }),
          el("div", { className: "chips" }, group.items.map((a) => {
            const input = el("input", { type: "checkbox", name: "addin", value: a.id, checked: state.addIns.includes(a.id) });
            const chip = el("span", { className: "chip" }, [
              document.createTextNode(a.name),
              a.price ? el("em", { text: `+${money.format(a.price)}` }) : null,
            ]);
            return el("label", { className: "option" }, [input, chip]);
          })),
        ])
      )
    );

    $("addin-note").textContent = `optional, up to ${shop.maxAddIns}`;
  }

  function renderSummary() {
    const info = describe(state);

    // Lock the remaining flavor chips once the limit is reached.
    const full = state.addIns.length >= shop.maxAddIns;
    document.querySelectorAll('input[name="addin"]').forEach((input) => {
      input.disabled = full && !input.checked;
    });
    $("addin-note").textContent = state.addIns.length
      ? `${state.addIns.length} of ${shop.maxAddIns} chosen`
      : `optional, up to ${shop.maxAddIns}`;

    document.documentElement.style.setProperty("--sauce", info.pepper ? info.pepper.color : "#d9d1c5");
    $("label-name").textContent = info.title;
    $("label-meter").replaceChildren(meter(info.pepper ? info.pepper.heat : 0));
    $("label-shu").textContent = info.pepper ? `${info.pepper.shu} SHU` : "Heat: pick a pepper";
    $("label-contains").textContent = containsLine(info);
    renderBottle(info);

    const total = money.format(info.unitPrice * state.qty);
    $("qty-value").textContent = state.qty;
    $("qty-minus").disabled = state.qty <= 1;
    $("builder-total").textContent = total;
    $("mobile-total").textContent = total;

    // Say exactly what's missing instead of a dead button.
    const ready = info.complete && !busy;
    const prompt = !info.pepper ? "Pick a pepper" : !info.base ? "Pick a base" : !info.almond ? "Almonds or not?" : `Add to order · ${total}`;
    [$("add-btn"), $("mobile-add-btn")].forEach((button) => {
      button.disabled = !ready;
      if (!busy) button.textContent = prompt;
    });
  }

  let busy = false;

  function addToOrder() {
    const info = describe(state);
    if (!info.complete || busy) return;
    const title = info.title;
    cart.push({
      key: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      pepper: state.pepper,
      base: state.base,
      almond: state.almond,
      addIns: state.addIns.slice(),
      size: state.size,
      label: state.label,
      qty: state.qty,
    });
    saveCart();
    renderCart();
    showToast(`Added ${state.qty} × ${title}. `);

    // Shake and blend the finished bottle, then start the next one empty.
    busy = true;
    setView("mixed");
    shake();
    [$("add-btn"), $("mobile-add-btn")].forEach((b) => {
      b.disabled = true;
      b.textContent = "Added ✓";
    });
    setTimeout(() => {
      busy = false;
      Object.assign(state, { pepper: null, base: null, almond: null, addIns: [], label: "", qty: 1 });
      $("label-input").value = "";
      document.querySelectorAll('#builder-form input[name="pepper"], #builder-form input[name="base"], #builder-form input[name="almond"], #builder-form input[name="addin"]')
        .forEach((input) => (input.checked = false));
      setView("layers");
      renderSummary();
    }, 1400);
  }

  function bindBuilder() {
    $("builder-form").addEventListener("change", (e) => {
      const { name, value, checked } = e.target;
      if (name === "pepper" || name === "base" || name === "almond" || name === "size") state[name] = value;
      if (name === "addin") {
        state.addIns = checked
          ? state.addIns.concat(value).slice(0, shop.maxAddIns)
          : state.addIns.filter((id) => id !== value);
      }
      renderSummary();
    });

    $("builder-form").addEventListener("submit", (e) => e.preventDefault());

    // Naming the sauce shows it on the front label as it's typed.
    $("label-input").addEventListener("focus", () => {
      if (view !== "label") setView("label");
      if (side !== "front") setSide("front");
    });

    // Spin the bottle to show the back label, and back again.
    $("turn-btn").addEventListener("click", () => {
      [$("vessel"), $("label-zoom")].forEach((node) => {
        node.classList.remove("turning");
        void node.offsetWidth;
        node.classList.add("turning");
      });
      setTimeout(() => setSide(side === "front" ? "back" : "front"), 250);
    });
    $("label-input").addEventListener("input", (e) => {
      state.label = e.target.value.trim();
      if (view !== "label") setView("label");
      renderSummary();
    });

    $("qty-minus").addEventListener("click", () => {
      state.qty = Math.max(1, state.qty - 1);
      renderSummary();
    });
    $("qty-plus").addEventListener("click", () => {
      state.qty = Math.min(24, state.qty + 1);
      renderSummary();
    });

    $("add-btn").addEventListener("click", addToOrder);

    $("mobile-add-btn").addEventListener("click", addToOrder);

    $("view-switch").addEventListener("click", (e) => {
      const button = e.target.closest("button");
      if (!button || button.dataset.view === view) return;
      if (view === "layers") shake(); // blending the layers gets a shake
      setView(button.dataset.view);
    });

    // Picking ingredients while shaken goes back to the layers so the pour shows.
    $("builder-form").addEventListener("change", () => view === "mixed" && setView("layers"));

    window.addEventListener("resize", () => renderLegend(layersFor(describe(state))));
  }

  let toastTimer;
  function showToast(message) {
    const toast = $("toast");
    toast.replaceChildren(document.createTextNode(message), el("a", { href: "#order", text: "View order" }));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.replaceChildren(), 5000);
  }

  // The builder panel can be taller than the window. Pin it so its bottom
  // (the price and add button) always stays on screen while scrolling.
  function bindStickyPanel() {
    const panel = $("summary");
    const place = () => {
      const header = document.querySelector(".site-header").getBoundingClientRect().height;
      const room = window.innerHeight - panel.getBoundingClientRect().height - 16;
      panel.style.top = `${Math.min(header + 20, room)}px`;
    };
    if ("ResizeObserver" in window) new ResizeObserver(place).observe(panel);
    window.addEventListener("resize", place);
    place();
  }

  // Phones: keep the price and add button in reach while choosing,
  // until the full label and button scroll into view.
  function bindMobileBar() {
    if (!("IntersectionObserver" in window)) return;
    let buildVisible = false;
    let summaryVisible = false;
    const update = () => ($("mobile-bar").hidden = !(buildVisible && !summaryVisible));
    new IntersectionObserver(([entry]) => {
      buildVisible = entry.isIntersecting;
      update();
    }).observe($("builder-form"));
    new IntersectionObserver(([entry]) => {
      summaryVisible = entry.isIntersecting;
      update();
    }, { threshold: 0.25 }).observe($("summary"));
  }

  // ---------- Cart & checkout ----------

  function cartBottle(color) {
    const node = el("span", { className: "cart-bottle", "aria-hidden": "true" });
    node.style.setProperty("--mix", color);
    return node;
  }

  function cartTotal() {
    return cart.reduce((sum, item) => sum + describe(item).unitPrice * item.qty, 0);
  }

  function renderCart() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const empty = cart.length === 0;
    $("cart-count").textContent = count;
    $("cart-empty").hidden = !empty;
    $("cart-total-row").hidden = empty;
    $("cart-note").hidden = empty;
    $("checkout-form").hidden = empty;
    $("cart-total").textContent = money.format(cartTotal());

    const anyAlmonds = cart.some((item) => describe(item).hasAlmonds);
    $("allergen-text").textContent = anyAlmonds
      ? "I understand my order contains tree nuts (almonds) and is made in a kitchen that handles tree nuts."
      : "I understand my order is made in a kitchen that handles tree nuts.";

    $("cart-list").replaceChildren(
      ...cart.map((item) => {
        const info = describe(item);
        const remove = el("button", { type: "button", className: "cart-remove", text: "Remove" });
        remove.addEventListener("click", () => {
          cart = cart.filter((c) => c.key !== item.key);
          saveCart();
          renderCart();
        });
        return el("li", {}, [
          cartBottle(mixColor(layersFor(info))),
          el("div", {}, [
            el("div", { className: "cart-title", text: `${item.qty} × ${info.title}` }),
            el("div", { className: "cart-meta", text: `${info.size.name} · ${info.recipe}` }),
          ]),
          el("div", { className: "cart-side" }, [el("div", { text: money.format(info.unitPrice * item.qty) }), remove]),
        ]);
      })
    );
  }

  function buildOrder(form) {
    const data = new FormData(form);
    return {
      id: "CD-" + Date.now().toString(36).toUpperCase(),
      placedAt: new Date().toISOString(),
      customer: {
        name: data.get("name").trim(),
        email: data.get("email").trim(),
        address: data.get("address").trim(),
        notes: data.get("notes").trim(),
      },
      items: cart.map((item) => {
        const info = describe(item);
        return {
          name: info.title,
          quantity: item.qty,
          size: info.size.name,
          pepper: info.pepper.name,
          base: info.base.name,
          almonds: info.hasAlmonds ? info.almond.name : "None",
          flavors: info.addIns.map((a) => a.name),
          ingredients: info.ingredients,
          unitPrice: info.unitPrice,
        };
      }),
      subtotal: cartTotal(),
    };
  }

  function bindCheckout() {
    $("checkout-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const button = $("place-btn");
      const order = buildOrder(form);
      $("form-error").textContent = "";
      button.disabled = true;
      button.textContent = "Placing order…";

      try {
        if (shop.orderEndpoint) {
          const res = await fetch(shop.orderEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(order),
          });
          if (!res.ok) throw new Error(`Order failed (${res.status})`);
        } else {
          console.info("Demo mode: order not sent anywhere.", order);
        }

        cart = [];
        saveCart();
        form.reset();
        renderCart();
        $("order-id").textContent = order.id;
        $("thanks").hidden = false;
        $("order").scrollIntoView();
      } catch (err) {
        $("form-error").textContent = "We couldn't send your order. Check your connection and try again.";
      } finally {
        button.disabled = false;
        button.textContent = "Place order";
      }
    });

    $("new-order-btn").addEventListener("click", () => ($("thanks").hidden = true));
  }

  // ---------- Boot ----------

  function fillShopText() {
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
    const lowest = Math.min(...shop.sizes.map((s) => s.price));
    const counts = { peppers: shop.peppers.length, bases: shop.bases.length, flavors: allAddIns.length };

    document.querySelectorAll("[data-shop-name]").forEach((node) => (node.textContent = shop.name));
    document.querySelectorAll("[data-shop-tagline]").forEach((node) => (node.textContent = shop.tagline));
    document.querySelectorAll("[data-ships-within]").forEach((node) => (node.textContent = shop.shipsWithin));
    document.querySelectorAll("[data-count]").forEach((node) => (node.textContent = counts[node.dataset.count]));
    document.querySelectorAll("[data-shop-email]").forEach((node) => {
      node.textContent = shop.contactEmail;
      node.href = `mailto:${shop.contactEmail}`;
    });
    $("from-price").textContent = `From ${money.format(lowest)} a bottle`;
    const ship = new Date(now);
    for (let days = shop.shipDays; days > 0; ) {
      ship.setDate(ship.getDate() + 1);
      if (ship.getDay() !== 0 && ship.getDay() !== 6) days--;
    }
    $("ship-note").textContent = `Made by hand to order · Ships by ${ship.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
    $("batch").textContent = `Batch ${String(now.getFullYear()).slice(2)}-${String(dayOfYear).padStart(3, "0")}`;
    $("year").textContent = now.getFullYear();
  }

  fillShopText();
  renderOptions();
  renderSummary();
  renderCart();
  bindBuilder();
  bindMobileBar();
  bindStickyPanel();
  bindCheckout();
})();
