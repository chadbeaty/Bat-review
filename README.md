# Ember & Almond — Build-Your-Own Hot Sauce

A minimal storefront where customers build a custom hot sauce (every bottle is made with almonds for protein) and place an order. Plain HTML, CSS and JavaScript, with no build step and no dependencies.

## How customers use it

1. **Pick a pepper.** Jalapeño, Chipotle, Habanero or Ghost Pepper, each with a heat rating.
2. **Choose almonds.** Smooth (blended in) or Crunchy (toasted bits).
3. **Add flavors.** Up to 3, all optional.
4. **Size & name.** Pick 5 oz or 10 oz, and optionally name the sauce for its label.

A live bottle preview and price update as they go. They can add several custom bottles to one order, then check out with name, email and shipping address. They also confirm the tree-nut allergen notice.

## Running it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

To publish it, upload the folder to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

## Running the shop

Everything you'd change is in **`config.js`**:

- `name` / `tagline`: brand text shown across the site.
- `peppers`, `almondStyles`, `addIns`, `sizes`: add, remove, rename or reprice ingredients. Each `addIns` entry has a `price` that is added per bottle (`0` = free).
- `maxAddIns`: how many flavors a customer can pick.
- `orderEndpoint`: **where orders go.** Out of the box this is empty (demo mode), so orders only show a confirmation on screen. To receive orders, create a free form endpoint (e.g. [Formspree](https://formspree.io)) and paste its URL here. Each order is POSTed as JSON with the customer details, every bottle's recipe, quantities and the total.

## Not included yet

- **Payments.** Orders are collected, not charged. Next step: add Stripe Checkout or Payment Links.
- **Shipping & tax** calculation.
