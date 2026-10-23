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

  function buildVessel(node) {
    node.innerHTML =
      '<div class="vessel-glass"><div class="vessel-fill"></div><div class="vessel-pour"></div></div>' +
      '<svg class="vessel-outline" viewBox="0 0 200 400" aria-hidden="true">' +
      `<path d="${BOTTLE_PATH}" fill="none" stroke="#2b2622" stroke-width="7" stroke-linejoin="round"/>` +
      '<path d="M46 196V352" stroke="#fff" stroke-opacity=".55" stroke-width="9" stroke-linecap="round"/>' +
      '<path d="M98 60V104" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>' +
      '<rect x="80" y="2" width="40" height="40" rx="6" fill="#2b2622"/>' +
      '<path d="M88 10V34M96 10V34M104 10V34M112 10V34" stroke="#4a423c" stroke-width="3"/>' +
      '<rect x="82" y="46" width="36" height="9" rx="3" fill="#2b2622"/>' +
      "</svg>";
    return { fill: node.querySelector(".vessel-fill"), pour: node.querySelector(".vessel-pour") };
  }

  const bigVessel = buildVessel($("vessel"));
  const miniVessel = buildVessel($("mini-vessel"));
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
    $("mix-btn").disabled = layers.length === 0;
    if (!layers.length) setMixed(false);

    const hint = !info.pepper
      ? "Pick a pepper to start filling your bottle."
      : !info.base
        ? "Now pour in a base."
        : !info.almond
          ? "Almonds or no almonds?"
          : info.addIns.length < shop.maxAddIns
            ? `Add up to ${shop.maxAddIns - info.addIns.length} more flavor${shop.maxAddIns - info.addIns.length === 1 ? "" : "s"}, or add it to your order.`
            : "Full bottle. Ready when you are.";
    $("stage-hint").textContent = hint;

    const count = layers.length;
    $("mobile-count").textContent = count ? `${count} ingredient${count === 1 ? "" : "s"}` : "Empty bottle";
  }

  let mixed = false;
  function setMixed(on) {
    mixed = on;
    $("vessel").classList.toggle("mixed", on);
    $("mini-vessel").classList.toggle("mixed", on);
    $("legend").classList.toggle("dim", on);
    $("mix-btn").setAttribute("aria-pressed", String(on));
    $("mix-btn").textContent = on ? "Show the layers" : "Shake it up";
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
    $("label-ingredients").textContent = info.ingredients;
    $("label-contains").textContent = info.hasAlmonds
      ? "Contains: tree nuts (almonds)."
      : "Made in a kitchen that handles tree nuts.";
    renderBottle(info);
    $("label-net").textContent = `Net ${info.size.name} (${info.size.volume})`;

    const total = money.format(info.unitPrice * state.qty);
    $("qty-value").textContent = state.qty;
    $("qty-minus").disabled = state.qty <= 1;
    $("builder-total").textContent = total;
    $("mobile-total").textContent = total;

    // Say exactly what's missing instead of a dead button.
    const ready = info.complete && !busy;
    const prompt = !info.pepper ? "Pick a pepper" : !info.base ? "Pick a base" : !info.almond ? "Almonds or not?" : "Add to order";
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
    setMixed(true);
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
      setMixed(false);
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

    $("label-input").addEventListener("input", (e) => {
      state.label = e.target.value.trim();
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

    $("mix-btn").addEventListener("click", () => {
      setMixed(!mixed);
      shake();
    });

    // Changing anything while blended goes back to the layered view.
    $("builder-form").addEventListener("change", () => mixed && setMixed(false));

    window.addEventListener("resize", () => renderLegend(layersFor(describe(state))));
  }

  let toastTimer;
  function showToast(message) {
    const toast = $("toast");
    toast.replaceChildren(document.createTextNode(message), el("a", { href: "#order", text: "View order" }));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.replaceChildren(), 5000);
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
          el("span", { className: "cart-swatch", style: { background: info.pepper.color } }),
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
    $("batch").textContent = `Batch ${String(now.getFullYear()).slice(2)}-${String(dayOfYear).padStart(3, "0")}`;
    $("year").textContent = now.getFullYear();
  }

  fillShopText();
  renderOptions();
  renderSummary();
  renderCart();
  bindBuilder();
  bindMobileBar();
  bindCheckout();
})();
