import { QUESTIONS, rankBats } from "./finder.js";
import { esc, stampsHTML, specLine, priceHTML, pulseHTML, actionButtons } from "./ui.js";

let answers = {};
let step = 0;

export function finderView(data) {
  return {
    title: "Bat Finder · Barrel Talk",
    html: `<div class="finder" id="finder-root"></div>`,
    mount(root, nav, refreshButtons) {
      const el = root.querySelector("#finder-root");

      function renderQuestion() {
        const q = QUESTIONS[step];
        el.innerHTML = `
          <div class="progress" aria-hidden="true">${QUESTIONS.map((_, i) => `<i class="${i <= step ? "done" : ""}"></i>`).join("")}</div>
          <div style="display:grid;gap:8px">
            <p class="eyebrow">Question ${step + 1} of ${QUESTIONS.length}</p>
            <h1 class="h1" id="q-title" tabindex="-1">${esc(q.title)}</h1>
            <p class="muted">${esc(q.help)}</p>
          </div>
          <div class="options" role="group" aria-labelledby="q-title">
            ${q.options
              .map(
                (o) => `<button type="button" class="option" data-v="${esc(o.v)}" aria-pressed="${answers[q.key] === o.v}"><strong>${esc(o.label)}</strong>${o.sub ? `<span>${esc(o.sub)}</span>` : ""}</button>`
              )
              .join("")}
          </div>
          <div class="finder-nav">
            ${step > 0 ? '<button class="btn ghost" type="button" id="q-back">← Back</button>' : "<span></span>"}
            ${Object.keys(answers).length ? '<button class="btn ghost" type="button" id="q-restart">Start over</button>' : ""}
          </div>`;
        el.querySelectorAll(".option").forEach((btn) =>
          btn.addEventListener("click", () => {
            answers[q.key] = btn.dataset.v;
            step += 1;
            step >= QUESTIONS.length ? renderResults() : renderQuestion();
            el.querySelector("h1")?.focus();
          })
        );
        el.querySelector("#q-back")?.addEventListener("click", () => {
          step -= 1;
          renderQuestion();
        });
        el.querySelector("#q-restart")?.addEventListener("click", restart);
      }

      function restart() {
        answers = {};
        step = 0;
        renderQuestion();
      }

      function renderResults() {
        const picks = rankBats(data.bats, answers);
        const summary = QUESTIONS.map((q) => q.options.find((o) => o.v === answers[q.key])?.label)
          .filter(Boolean)
          .join(" · ");
        el.innerHTML = `
          <div style="display:grid;gap:8px">
            <p class="eyebrow">Your short list</p>
            <h1 class="h1" tabindex="-1">${picks.length ? `${picks.length} bats that fit` : "Nothing fits all of that"}</h1>
            <p class="muted">${esc(summary)}</p>
          </div>
          ${
            picks.length
              ? `<ul class="bat-list" style="border-top:1px solid var(--ink)">${picks
                  .map(
                    ({ bat, why, match }) => `<li class="bat-row">
                <div class="bat-row-main">
                  <span class="bat-brand">${esc(bat.brand)} · <span class="match">${match}% match</span></span>
                  <a class="bat-name" href="#bat-${esc(bat.id)}">${esc(bat.model)}</a>
                  <div class="bat-meta">${stampsHTML(bat)}${specLine(bat)}</div>
                  <ul class="why">${why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
                </div>
                <div class="bat-side">${pulseHTML(bat)}${priceHTML(bat)}${actionButtons(bat)}</div>
              </li>`
                  )
                  .join("")}</ul>`
              : `<p>Try a higher budget, or choose “No preference” for feel.</p>`
          }
          ${answers.league === "UNSURE" ? '<p class="notice">You weren\'t sure about your league, so these are all dual-stamp bats. Ask your league director which stamp they require. A single-stamp bat opens up many more options.</p>' : ""}
          <div class="finder-nav">
            <button class="btn" type="button" id="q-change">← Change answers</button>
            <button class="btn ghost" type="button" id="q-restart">Start over</button>
          </div>`;
        el.querySelector("#q-change").addEventListener("click", () => {
          step = QUESTIONS.length - 1;
          renderQuestion();
        });
        el.querySelector("#q-restart").addEventListener("click", restart);
        refreshButtons();
      }

      step >= QUESTIONS.length ? renderResults() : renderQuestion();
    },
  };
}
