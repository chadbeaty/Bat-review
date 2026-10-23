(function () {
  "use strict";

  const shop = window.SHOP;
  const CART_KEY = "ea-cart-v2";
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

  const state = {
    pepper: (byId(shop.peppers, "habanero") || shop.peppers[0]).id,
    base: shop.bases[0].id,
    almond: shop.almondStyles[0].id,
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

  function describe(item) {
    const pepper = byId(shop.peppers, item.pepper);
    const base = byId(shop.bases, item.base);
    const almond = byId(shop.almondStyles, item.almond);
    const size = byId(shop.sizes, item.size);
    const addIns = item.addIns.map((id) => byId(allAddIns, id));
    const hasAlmonds = Boolean(almond.ingredient);

    const second = hasAlmonds ? "Almond" : addIns.length ? addIns[0].name : "Classic";
    const ingredients = [pepper.ingredient, base.ingredient, almond.ingredient]
      .concat(addIns.map((a) => a.ingredient), "sea salt")
      .filter(Boolean)
      .join(", ");

    return {
      title: item.label || `${pepper.name} ${second}`,
      pepper,
      base,
      almond,
      size,
      addIns,
      hasAlmonds,
      ingredients: capitalize(ingredients) + ".",
      unitPrice: size.price + base.price + almond.price + addIns.reduce((sum, a) => sum + a.price, 0),
      recipe: [pepper.name, base.name, hasAlmonds ? `${almond.name} almonds` : "No almonds"]
        .concat(addIns.map((a) => a.name))
        .join(" · "),
    };
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

    document.documentElement.style.setProperty("--sauce", info.pepper.color);
    $("label-name").textContent = info.title;
    $("label-meter").replaceChildren(meter(info.pepper.heat));
    $("label-shu").textContent = `${info.pepper.shu} SHU`;
    $("label-ingredients").textContent = info.ingredients;
    $("label-contains").textContent = info.hasAlmonds
      ? "Contains: tree nuts (almonds)."
      : "Made in a kitchen that handles tree nuts.";
    $("label-net").textContent = `Net ${info.size.name} (${info.size.volume})`;

    const total = money.format(info.unitPrice * state.qty);
    $("qty-value").textContent = state.qty;
    $("qty-minus").disabled = state.qty <= 1;
    $("builder-total").textContent = total;
    $("mobile-total").textContent = total;
  }

  function addToOrder() {
    const title = describe(state).title;
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

    // Fresh start for the next bottle, keeping the pepper, base and size they liked.
    state.addIns = [];
    state.label = "";
    state.qty = 1;
    $("label-input").value = "";
    document.querySelectorAll('input[name="addin"]').forEach((input) => (input.checked = false));
    renderSummary();
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

    $("mobile-add-btn").addEventListener("click", (e) => {
      addToOrder();
      const button = e.currentTarget;
      button.textContent = "Added ✓";
      setTimeout(() => (button.textContent = "Add to order"), 1600);
    });
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
      id: "EA-" + Date.now().toString(36).toUpperCase(),
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
