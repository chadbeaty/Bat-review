// Small wrapper around localStorage. Every access is guarded: storage can be blocked or empty.

const PREFIX = "barreltalk:";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable; the in-memory copy still works for this visit */
  }
}

const memory = {
  saved: read("saved", []),
  compare: read("compare", []),
  filters: read("filters", null),
  reviews: read("reviews", {}),
};

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
}
function emit() {
  listeners.forEach((fn) => fn());
}

export const MAX_COMPARE = 4;

export const store = {
  get saved() {
    return memory.saved;
  },
  get compare() {
    return memory.compare;
  },
  isSaved: (id) => memory.saved.includes(id),
  isComparing: (id) => memory.compare.includes(id),
  toggleSaved(id) {
    memory.saved = memory.saved.includes(id) ? memory.saved.filter((x) => x !== id) : [...memory.saved, id];
    write("saved", memory.saved);
    emit();
    return memory.saved.includes(id);
  },
  // Returns "added", "removed" or "full".
  toggleCompare(id) {
    if (memory.compare.includes(id)) {
      memory.compare = memory.compare.filter((x) => x !== id);
    } else if (memory.compare.length >= MAX_COMPARE) {
      return "full";
    } else {
      memory.compare = [...memory.compare, id];
    }
    write("compare", memory.compare);
    emit();
    return memory.compare.includes(id) ? "added" : "removed";
  },
  clearCompare() {
    memory.compare = [];
    write("compare", memory.compare);
    emit();
  },
  get filters() {
    return memory.filters;
  },
  setFilters(f) {
    memory.filters = f;
    write("filters", f);
  },
  localReviews(batId) {
    return memory.reviews[batId] || [];
  },
  addLocalReview(batId, review) {
    memory.reviews = { ...memory.reviews, [batId]: [review, ...(memory.reviews[batId] || [])] };
    write("reviews", memory.reviews);
  },
};
