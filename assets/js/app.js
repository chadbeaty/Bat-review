// Boot and hash routing. Routes are bare tokens (#bats, #bat-<id>) so links work on any static host.

import { loadData } from "./data.js";
import { store, onChange } from "./store.js";
import { toast, icons } from "./ui.js";
import { homeView, listView, batView, compareView, savedView, guideView, aboutView, notFoundView } from "./views.js";
import { finderView } from "./finder-view.js";

const root = document.getElementById("app");
let data;

function resolve(hash) {
  const token = hash.replace(/^#/, "");
  if (!token || token === "home") return ["home", homeView(data)];
  if (token.startsWith("bat-")) return ["bats", batView(data, token.slice(4))];
  const routes = { bats: listView, finder: finderView, compare: compareView, saved: savedView, guide: guideView, about: aboutView };
  return routes[token] ? [token, routes[token](data)] : ["", notFoundView()];
}

function render() {
  const [section, view] = resolve(location.hash);
  document.title = view.title;
  root.innerHTML = view.html;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === section) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  view.mount?.(root, navigate, refreshButtons);
  refreshButtons();
  window.scrollTo(0, 0);
}

function navigate(token, force) {
  if (location.hash === "#" + token && force) render();
  else location.hash = token;
}

function refreshButtons() {
  document.querySelectorAll('[data-act="save"]').forEach((b) => {
    const on = store.isSaved(b.dataset.id);
    b.setAttribute("aria-pressed", String(on));
    if (b.classList.contains("icon-btn")) b.innerHTML = on ? icons.starFilled : icons.star;
  });
  document.querySelectorAll('[data-act="compare"]').forEach((b) => b.setAttribute("aria-pressed", String(store.isComparing(b.dataset.id))));
  const setCount = (id, n) => {
    const el = document.getElementById(id);
    el.textContent = n;
    el.hidden = !n;
  };
  setCount("saved-count", store.saved.length);
  setCount("compare-count", store.compare.length);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.act === "save") {
    toast(store.toggleSaved(id) ? "Saved" : "Removed from saved");
  } else if (btn.dataset.act === "compare") {
    const result = store.toggleCompare(id);
    toast(result === "full" ? "You can compare up to 4 bats. Remove one first." : result === "added" ? "Added to compare" : "Removed from compare");
  }
});

onChange(refreshButtons);
window.addEventListener("hashchange", render);

loadData().then((d) => {
  data = d;
  if (!data.bats.length) {
    root.innerHTML = '<div class="empty"><p>The bat catalog didn\'t load. If you opened this file directly, run it from a web server instead (see README).</p></div>';
    return;
  }
  render();
});
