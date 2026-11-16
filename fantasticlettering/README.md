# Fantastic Lettering: concept website

A one-page site built to get leads, made as a pitch for **Fantastic Lettering** (5644 W Lawrence Ave, Chicago, IL 60630), a commercial screen printing and embroidery shop in Jefferson Park.

It's one file, `index.html`, with no build step. Open it in any browser.

## What brings in leads

1. **Instant price estimator.** A visitor picks a garment, quantity, decoration, ink colors, shirt color, 2XL+ count and standard or rush. They see a ballpark price per piece, a full breakdown (dark-shirt base layer, size upcharge, rush fee, setup), the total and an estimated ready-by date. It also nudges them toward bigger orders ("Order 144 and drop to about $X each, and screen setup is free"). It's tagged "Sample pricing" until real prices go in.
2. **Logo mockup.** Visitors upload their logo and see it on the shirt, front or back (left chest for embroidery, front panel for hats). They can drag it into place, resize it with a slider that shows the print width in inches, and get a quick quality check (for example "this image may look soft at 9 inches"). The logo is attached to their quote automatically.
3. **A three-step quote form**: what they need (items, quantity, deadline, decoration, pickup or delivery), then sizes and artwork (size breakdown, "print-ready / needs cleanup / needs a design", file upload, notes), then contact details. **Lock in my exact quote** fills it in from the estimator. It catches bots and shows a clear thank-you message.
4. **Uniform programs section** pitching repeat business accounts (approved items list, art on file, new hires, seasonal check-ins), with an example account card.
5. **Calls to action everywhere**: a "Get a free quote" button in the header, a deadline banner ("Need shirts for an event this month?"), and a sticky Call / Free quote bar on phones.
6. **Trust-builders**: "since 1984", printed in-house, a 1-day quote promise, how it works, who they print for, FAQ, and a map with live "Open now" hours.

## Before launch (must do)

| Item | Where | Why |
|---|---|---|
| Confirm the **phone number** | `CONFIG.phoneDisplay` / `phoneDial` in the script | Online listings disagree: (331) 305-2468, (773) 685-7650 and (847) 338-7652 all appear. The page uses the first. |
| Connect the **quote form** | `CONFIG.formEndpoint` | It's empty right now, so nothing gets sent. Paste a Formspree (free) or similar endpoint so requests reach the shop's inbox. |
| Replace the **ballpark prices** | `GARMENTS`, `SCREEN_BREAKS`, `EMB_BREAKS`, `DARK_BASE_PER_LOC`, `XL_UPCHARGE`, `RUSH_PCT`, `STANDARD_DAYS`, `RUSH_DAYS` | These are typical Chicago-area numbers, not the shop's real prices. Then set `CONFIG.samplePricing` to `false` to remove the "Sample pricing" tag. |
| Confirm the **claims** | Hero, stats, FAQ | "Since 1984" (matches BBB; their old site said 1975, we went with 1984; confirm with the owner), 24-piece screen print minimum, 12-piece embroidery minimum, about 10 business days turnaround, rush in about 5 business days for 25% more, 1 business day quotes, free mockups, deposit and invoicing terms, local delivery and U.S. shipping, no new embroidery setup fee on reorders, the uniform program services (seasonal check-ins, small new-hire orders). |
| Add **real photos and reviews** | Services and hero | The shop's own work, press and team photos, and real Google reviews. We left reviews out on purpose rather than make any up. |
| Remove the **concept banner** and the `noindex` meta tag | Top of `index.html` | They keep the preview from looking official and from showing up in search. |
| Add their real **logo** | Header and footer | The "FL" mark is a placeholder. |

## Hosting

Any static host works: Vercel, Netlify or GitHub Pages. With Vercel, set the project's root directory to `fantasticlettering`.
