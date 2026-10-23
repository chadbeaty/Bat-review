// Everything a shop owner needs to change lives in this file:
// brand name, ingredients, sizes, prices and where orders are sent.
window.SHOP = {
  name: "Chaddy Daddy's",
  fullName: "Chaddy Daddy's Hot Sauce",
  tagline: "Small-batch hot sauce with almonds for body and plant protein, or without. You pick every ingredient. We make it by hand and put your name on the label.",
  contactEmail: "hello@chaddydaddys.com",
  shipsWithin: "5 business days",
  shipDays: 5, // business days, used for the estimated ship date shown at checkout

  // Where orders are sent. Paste a form endpoint here (e.g. a Formspree,
  // Basin or Getform URL) and every order is POSTed to it as JSON.
  // Leave it empty to run in demo mode (orders are only shown on screen).
  orderEndpoint: "",

  currency: "USD",
  maxAddIns: 4,

  // Step 1: one pepper per bottle. `heat` is 1–5; `shu` is the Scoville range.
  // `ingredient` is how it reads on the bottle's ingredient list.
  peppers: [
    { id: "poblano", name: "Poblano", note: "Earthy, barely there", heat: 1, shu: "1K–1.5K", color: "#5d6b45", ingredient: "poblano peppers" },
    { id: "jalapeno", name: "Jalapeño", note: "Bright & green", heat: 2, shu: "2.5K–8K", color: "#6f7d4a", ingredient: "jalapeño peppers" },
    { id: "chipotle", name: "Chipotle", note: "Smoked & savory", heat: 2, shu: "2.5K–8K", color: "#6e4a36", ingredient: "chipotle peppers" },
    { id: "fresno", name: "Fresno", note: "Fruity & clean", heat: 2, shu: "2.5K–10K", color: "#a4553f", ingredient: "fresno peppers" },
    { id: "serrano", name: "Serrano", note: "Crisp, sharp bite", heat: 3, shu: "10K–23K", color: "#57683f", ingredient: "serrano peppers" },
    { id: "cayenne", name: "Cayenne", note: "Classic & direct", heat: 3, shu: "30K–50K", color: "#a24a37", ingredient: "cayenne peppers" },
    { id: "habanero", name: "Habanero", note: "Floral & hot", heat: 4, shu: "100K–350K", color: "#b46c3c", ingredient: "habanero peppers" },
    { id: "scotch-bonnet", name: "Scotch Bonnet", note: "Sweet, island heat", heat: 4, shu: "100K–350K", color: "#bb8a45", ingredient: "scotch bonnet peppers" },
    { id: "ghost", name: "Ghost Pepper", note: "Slow, deep burn", heat: 5, shu: "855K–1M", color: "#8b3a34", ingredient: "ghost peppers" },
    { id: "reaper", name: "Carolina Reaper", note: "For the brave", heat: 5, shu: "1.4M–2.2M", color: "#6f2a2c", ingredient: "Carolina Reaper peppers" },
  ],

  // Step 2: the liquid the sauce is built on. `price` is added per bottle.
  // Every ingredient's `color` is how its layer looks in the bottle preview.
  bases: [
    { id: "distilled", name: "Distilled Vinegar", note: "Bright & classic", price: 0, ingredient: "distilled vinegar", color: "#ddd6c3" },
    { id: "cider", name: "Apple Cider Vinegar", note: "Fruity & mellow", price: 0, ingredient: "apple cider vinegar", color: "#c39050" },
    { id: "rice", name: "Rice Vinegar", note: "Clean & gentle", price: 0, ingredient: "rice vinegar", color: "#e6dbbd" },
    { id: "lime", name: "Fresh Lime Juice", note: "Zesty, no vinegar", price: 0, ingredient: "lime juice", color: "#aab667" },
    { id: "fermented", name: "Fermented", note: "Aged 30 days, deep & tangy", price: 2, ingredient: "water, distilled vinegar", color: "#a1703f" },
  ],

  // Step 3: almonds are optional. An entry with `ingredient: null` means none.
  almondStyles: [
    { id: "smooth", name: "Smooth", note: "Blended in for a creamy body", price: 0, ingredient: "almonds", color: "#d6b48a" },
    { id: "crunchy", name: "Crunchy", note: "Toasted bits for texture", price: 0, ingredient: "toasted almonds", color: "#b8874f" },
    { id: "smoked", name: "Smoked", note: "Blended, with a campfire edge", price: 1, ingredient: "smoked almonds", color: "#86583a" },
    { id: "none", name: "No Almonds", note: "Leave them out", price: 0, ingredient: null },
  ],

  // Step 4: optional flavors, shown in groups. `price` is added per bottle.
  addInGroups: [
    {
      name: "Aromatics",
      items: [
        { id: "garlic", name: "Roasted Garlic", price: 0, ingredient: "roasted garlic", color: "#e4d6b4" },
        { id: "black-garlic", name: "Black Garlic", price: 1, ingredient: "black garlic", color: "#3d302a" },
        { id: "shallot", name: "Shallot", price: 0, ingredient: "shallot", color: "#c49b98" },
        { id: "ginger", name: "Ginger", price: 0, ingredient: "ginger", color: "#d5ae62" },
        { id: "lemongrass", name: "Lemongrass", price: 0, ingredient: "lemongrass", color: "#bfc184" },
      ],
    },
    {
      name: "Fruit & Citrus",
      items: [
        { id: "lime-zest", name: "Lime Zest", price: 0, ingredient: "lime zest", color: "#93a845" },
        { id: "mango", name: "Mango", price: 1, ingredient: "mango", color: "#dfa13a" },
        { id: "pineapple", name: "Pineapple", price: 1, ingredient: "pineapple", color: "#e0c255" },
        { id: "peach", name: "Peach", price: 1, ingredient: "peach", color: "#e39d74" },
        { id: "blood-orange", name: "Blood Orange", price: 1, ingredient: "blood orange juice", color: "#b2432d" },
        { id: "tamarind", name: "Tamarind", price: 0, ingredient: "tamarind", color: "#6b3f26" },
      ],
    },
    {
      name: "Herbs & Spice",
      items: [
        { id: "cilantro", name: "Cilantro", price: 0, ingredient: "cilantro", color: "#5e8a3e" },
        { id: "basil", name: "Basil", price: 0, ingredient: "basil", color: "#4c763a" },
        { id: "paprika", name: "Smoked Paprika", price: 0, ingredient: "smoked paprika", color: "#a5432c" },
        { id: "cumin", name: "Cumin", price: 0, ingredient: "cumin", color: "#a4733a" },
        { id: "turmeric", name: "Turmeric", price: 0, ingredient: "turmeric", color: "#d1952a" },
        { id: "sichuan", name: "Sichuan Peppercorn", price: 1, ingredient: "Sichuan peppercorn", color: "#7a3b2e" },
      ],
    },
    {
      name: "Sweet & Deep",
      items: [
        { id: "honey", name: "Honey", price: 0, ingredient: "honey", color: "#d6a03e" },
        { id: "maple", name: "Maple Syrup", price: 0, ingredient: "maple syrup", color: "#a5652a" },
        { id: "brown-sugar", name: "Brown Sugar", price: 0, ingredient: "brown sugar", color: "#8a5832" },
        { id: "cacao", name: "Cacao", price: 1, ingredient: "cacao", color: "#4a2f25" },
        { id: "coffee", name: "Coffee", price: 0, ingredient: "coffee", color: "#3a2a22" },
      ],
    },
  ],

  // Flavor profile shown with each bottle. Each note scores 0–5 from the
  // ingredients listed under it (id: points). Heat comes from the pepper.
  tasteNotes: {
    Smoky: { chipotle: 3, smoked: 2, paprika: 2, "black-garlic": 1, coffee: 1, cacao: 1, cumin: 1 },
    Sweet: { honey: 3, maple: 3, "brown-sugar": 3, mango: 2, pineapple: 2, peach: 2, "scotch-bonnet": 1, cacao: 1 },
    Tangy: { distilled: 3, cider: 2, rice: 2, lime: 3, fermented: 4, "lime-zest": 1, tamarind: 2, "blood-orange": 1, pineapple: 1 },
    Fruity: { mango: 3, pineapple: 3, peach: 3, "blood-orange": 3, habanero: 1, "scotch-bonnet": 2, fresno: 1, "lime-zest": 1, tamarind: 1 },
    Savory: { garlic: 2, "black-garlic": 3, shallot: 2, cumin: 2, smooth: 1, crunchy: 1, smoked: 1, fermented: 1, poblano: 1, ginger: 1, turmeric: 1 },
  },
  // What to pour it on, by the bottle's strongest notes.
  pairings: {
    Heat: "wings",
    Smoky: "brisket and burgers",
    Sweet: "fried chicken",
    Tangy: "tacos and eggs",
    Fruity: "fish tacos and shrimp",
    Savory: "pizza and noodles",
  },

  // Step 5: bottle size and base price.
  sizes: [
    { id: "5oz", name: "5 fl oz", volume: "148 mL", price: 12 },
    { id: "10oz", name: "10 fl oz", volume: "296 mL", price: 20 },
  ],
};
