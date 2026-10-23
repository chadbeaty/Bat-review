(function () {
  "use strict";

  const shop = window.SHOP;
  const CART_KEY = "ea-cart";
  const $ = (id) => document.getElementById(id);
  const byId = (list, id) => list.find((item) => item.id === id);

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

  function heatDots(level, max = 4) {
    const wrap = el("span", { className: "heat", "aria-label": `Heat ${level} of ${max}` });
    for (let i = 1; i <= max; i++) {
      wrap.append(el("span", { className: i <= level ? "" : "off", text: "●" }));
    }
    return wrap;
  }

  // ---------- State ----------

  const state = {
    pepper: shop.peppers[2] ? shop.peppers[2].id : shop.peppers[0].id,
    almond: shop.almondStyles[0].id,
    addIns: [],
    size: shop.sizes[0].id,
    label: "",
    qty: 1,
  };

  let cart = loadCart();

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY));
      // Drop saved bottles whose ingredients were since removed from config.js.
      return Array.isArray(saved) ? saved.filter(isValidItem) : [];
    } catch (e) {
      return [];
    }
  }

  function isValidItem(item) {
    return (
      item &&
      byId(shop.peppers, item.pepper) &&
      byId(shop.almondStyles, item.almond) &&
      byId(shop.sizes, item.size) &&
      Array.isArray(item.addIns) &&
      item.addIns.every((id) => byId(shop.addIns, id))
    );
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {
      // Storage can be unavailable (private mode); the cart still works for this visit.
    }
  }

  function unitPrice(item) {
    const size = byId(shop.sizes, item.size);
    const extras = item.addIns.reduce((sum, id) => sum + (byId(shop.addIns, id).price || 0), 0);
    return (size ? size.price : 0) + extras;
  }

  function describe(item) {
    const pepper = byId(shop.peppers, item.pepper);
    const almond = byId(shop.almondStyles, item.almond);
    const size = byId(shop.sizes, item.size);
    const addIns = item.addIns.map((id) => byId(shop.addIns, id).name);
    return {
      title: item.label || `${pepper.name} Almond`,
      pepper,
      almond,
      size,
      addIns,
      line: [pepper.name, `${almond.name.toLowerCase()} almond`].concat(addIns).join(" · "),
    };
  }

  // ---------- Builder ----------

  function optionCard(type, name, value, checked, title, note, extra) {
    const input = el("input", { type, name, value, checked });
    const strong = el("strong", {}, [document.createTextNode(title), extra]);
    const card = el("span", { className: "option-card" }, [strong, note ? el("small", { text: note }) : null]);
    return el("label", { className: "option" }, [input, card]);
  }

  function renderOptions() {
    $("pepper-options").replaceChildren(
      ...shop.peppers.map((p) =>
        optionCard("radio", "pepper", p.id, p.id === state.pepper, p.name, p.note, heatDots(p.heat))
      )
    );

    $("almond-options").replaceChildren(
      ...shop.almondStyles.map((a) => optionCard("radio", "almond", a.id, a.id === state.almond, a.name, a.note))
    );

    $("addin-options").replaceChildren(
      ...shop.addIns.map((a) => {
        const input = el("input", { type: "checkbox", name: "addin", value: a.id, checked: state.addIns.includes(a.id) });
        const chip = el("span", { className: "chip" }, [
          document.createTextNode(a.name),
          a.price ? el("em", { text: ` +${money.format(a.price)}` }) : null,
        ]);
        return el("label", { className: "option" }, [input, chip]);
      })
    );

    $("size-options").replaceChildren(
      ...shop.sizes.map((s) =>
        optionCard("radio", "size", s.id, s.id === state.size, s.name, money.format(s.price))
      )
    );

    $("addin-note").textContent = `up to ${shop.maxAddIns}, optional`;
  }

  function renderSummary() {
    const info = describe(state);

    // Lock extra flavor chips once the limit is reached.
    const full = state.addIns.length >= shop.maxAddIns;
    document.querySelectorAll('input[name="addin"]').forEach((input) => {
      input.disabled = full && !input.checked;
    });

    document.documentElement.style.setProperty("--sauce", info.pepper.color);
    $("bottle-name").textContent = info.title;
    $("bottle-heat").textContent = "●".repeat(info.pepper.heat);

    const rows = [
      ["Pepper", info.pepper.name],
      ["Almonds", info.almond.name],
      ["Flavors", info.addIns.length ? info.addIns.join(", ") : "None"],
      ["Size", info.size.name],
    ];
    $("summary-list").replaceChildren(
      ...rows.map(([k, v]) => el("li", {}, [el("span", { text: k }), el("span", { text: v })]))
    );

    $("qty-value").textContent = state.qty;
    $("qty-minus").disabled = state.qty <= 1;
    $("builder-total").textContent = money.format(unitPrice(state) * state.qty);
  }

  function bindBuilder() {
    $("builder-form").addEventListener("change", (e) => {
      const { name, value, checked } = e.target;
      if (name === "pepper" || name === "almond" || name === "size") state[name] = value;
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

    $("add-btn").addEventListener("click", () => {
      cart.push({
        key: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        pepper: state.pepper,
        almond: state.almond,
        addIns: state.addIns.slice(),
        size: state.size,
        label: state.label,
        qty: state.qty,
      });
      saveCart();
      renderCart();
      showToast(`Added ${state.qty} × ${describe(state).title}. `);

      // Fresh start for the next bottle, keeping the pepper/size they liked.
      state.addIns = [];
      state.label = "";
      state.qty = 1;
      $("label-input").value = "";
      document.querySelectorAll('input[name="addin"]').forEach((input) => (input.checked = false));
      renderSummary();
    });
  }

  let toastTimer;
  function showToast(message) {
    const toast = $("toast");
    toast.replaceChildren(document.createTextNode(message), el("a", { href: "#order", text: "View order" }));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.replaceChildren(), 4000);
  }

  // ---------- Cart & checkout ----------

  function cartTotal() {
    return cart.reduce((sum, item) => sum + unitPrice(item) * item.qty, 0);
  }

  function renderCart() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    $("cart-count").textContent = count;
    $("cart-empty").hidden = cart.length > 0;
    $("cart-total-row").hidden = cart.length === 0;
    $("checkout-form").hidden = cart.length === 0;
    $("cart-total").textContent = money.format(cartTotal());

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
            el("div", { className: "cart-meta", text: `${info.size.name} · ${info.line}` }),
          ]),
          el("div", { className: "cart-side" }, [
            el("div", { text: money.format(unitPrice(item) * item.qty) }),
            remove,
          ]),
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
          almonds: info.almond.name,
          flavors: info.addIns,
          unitPrice: unitPrice(item),
        };
      }),
      total: cartTotal(),
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
          console.info("Demo mode — order not sent anywhere:", order);
        }

        cart = [];
        saveCart();
        form.reset();
        renderCart();
        $("order-id").textContent = order.id;
        $("thanks").hidden = false;
        $("order").scrollIntoView();
      } catch (err) {
        $("form-error").textContent = "Something went wrong placing your order. Please try again.";
      } finally {
        button.disabled = false;
        button.textContent = "Place order";
      }
    });

    $("new-order-btn").addEventListener("click", () => {
      $("thanks").hidden = true;
      $("build").scrollIntoView();
    });
  }

  // ---------- Boot ----------

  document.querySelectorAll("[data-shop-name]").forEach((node) => (node.textContent = shop.name));
  document.querySelectorAll("[data-shop-tagline]").forEach((node) => (node.textContent = shop.tagline));
  document.title = `${shop.name} — Build Your Hot Sauce`;
  $("year").textContent = new Date().getFullYear();

  renderOptions();
  renderSummary();
  renderCart();
  bindBuilder();
  bindCheckout();
})();
