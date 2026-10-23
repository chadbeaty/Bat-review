# Chaddy Daddy's Hot Sauce

The storefront for Chaddy Daddy's Hot Sauce, where customers build a custom hot sauce, with almonds for body and plant protein or without, and place an order. Plain HTML, CSS and JavaScript, with no build step. Fonts load from Google Fonts.

## How customers use it

1. **Pepper.** 10 peppers from Poblano to Carolina Reaper, each with a heat meter and Scoville range.
2. **Base.** Distilled, apple cider or rice vinegar, fresh lime juice, or fermented.
3. **Almonds.** Smooth, crunchy, smoked, or no almonds.
4. **Flavors.** Up to 4 from 22, grouped as aromatics, fruit & citrus, herbs & spice, and sweet & deep.
5. **Size & name.** 5 or 10 fl oz, and an optional name printed on the label.

A bottle label fills in as they go: sauce name, heat, a real ingredient statement, the allergen line and net volume. They can add several bottles to one order, then check out with name, email and shipping address, confirming the tree-nut notice. The site also has How it works, Why almonds, FAQ and footer sections.

## Running it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

To publish it, upload the folder to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

## Running the shop

Everything you'd change is in **`config.js`**:

- `name`, `tagline`, `contactEmail`, `shipsWithin`: brand text shown across the site. The logo, wordmark and brand copy live in `index.html`; brand colors and fonts are the variables at the top of `styles.css`.
- `peppers`, `bases`, `almondStyles`, `addInGroups`, `sizes`: add, remove, rename or reprice ingredients. `price` is added per bottle (`0` = free). `ingredient` is how the item reads on the label's ingredient list. The counts on the page ("10 peppers, 5 bases…") update automatically.
- `maxAddIns`: how many flavors a customer can pick.
- `orderEndpoint`: **where orders go.** Out of the box this is empty (demo mode), so orders only show a confirmation on screen. To receive orders, create a free form endpoint (e.g. [Formspree](https://formspree.io)) and paste its URL here. Each order is POSTed as JSON with the customer details, every bottle's recipe, quantities and the total.

## Not included yet

- **Payments.** Orders are collected, not charged. Next step: add Stripe Checkout or Payment Links.
- **Shipping & tax** calculation.
- **Privacy policy and terms** pages, which you'll want before taking real orders.
