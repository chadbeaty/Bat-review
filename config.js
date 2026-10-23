// Everything a shop owner needs to change lives in this file:
// brand name, ingredients, sizes, prices and where orders are sent.
window.SHOP = {
  name: "Ember & Almond",
  tagline: "Small-batch hot sauce with almonds for body and plant protein. You choose every ingredient. We make it by hand and put your name on the label.",
  contactEmail: "hello@emberandalmond.com",
  shipsWithin: "5 business days",

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
  bases: [
    { id: "distilled", name: "Distilled Vinegar", note: "Bright & classic", price: 0, ingredient: "distilled vinegar" },
    { id: "cider", name: "Apple Cider Vinegar", note: "Fruity & mellow", price: 0, ingredient: "apple cider vinegar" },
    { id: "rice", name: "Rice Vinegar", note: "Clean & gentle", price: 0, ingredient: "rice vinegar" },
    { id: "lime", name: "Fresh Lime Juice", note: "Zesty, no vinegar", price: 0, ingredient: "lime juice" },
    { id: "fermented", name: "Fermented", note: "Aged 30 days, deep & tangy", price: 2, ingredient: "water, distilled vinegar" },
  ],

  // Step 3: almonds are optional. An entry with `ingredient: null` means none.
  almondStyles: [
    { id: "smooth", name: "Smooth", note: "Blended in for a creamy body", price: 0, ingredient: "almonds" },
    { id: "crunchy", name: "Crunchy", note: "Toasted bits for texture", price: 0, ingredient: "toasted almonds" },
    { id: "smoked", name: "Smoked", note: "Blended, with a campfire edge", price: 1, ingredient: "smoked almonds" },
    { id: "none", name: "No Almonds", note: "Leave them out", price: 0, ingredient: null },
  ],

  // Step 4: optional flavors, shown in groups. `price` is added per bottle.
  addInGroups: [
    {
      name: "Aromatics",
      items: [
        { id: "garlic", name: "Roasted Garlic", price: 0, ingredient: "roasted garlic" },
        { id: "black-garlic", name: "Black Garlic", price: 1, ingredient: "black garlic" },
        { id: "shallot", name: "Shallot", price: 0, ingredient: "shallot" },
        { id: "ginger", name: "Ginger", price: 0, ingredient: "ginger" },
        { id: "lemongrass", name: "Lemongrass", price: 0, ingredient: "lemongrass" },
      ],
    },
    {
      name: "Fruit & Citrus",
      items: [
        { id: "lime-zest", name: "Lime Zest", price: 0, ingredient: "lime zest" },
        { id: "mango", name: "Mango", price: 1, ingredient: "mango" },
        { id: "pineapple", name: "Pineapple", price: 1, ingredient: "pineapple" },
        { id: "peach", name: "Peach", price: 1, ingredient: "peach" },
        { id: "blood-orange", name: "Blood Orange", price: 1, ingredient: "blood orange juice" },
        { id: "tamarind", name: "Tamarind", price: 0, ingredient: "tamarind" },
      ],
    },
    {
      name: "Herbs & Spice",
      items: [
        { id: "cilantro", name: "Cilantro", price: 0, ingredient: "cilantro" },
        { id: "basil", name: "Basil", price: 0, ingredient: "basil" },
        { id: "paprika", name: "Smoked Paprika", price: 0, ingredient: "smoked paprika" },
        { id: "cumin", name: "Cumin", price: 0, ingredient: "cumin" },
        { id: "turmeric", name: "Turmeric", price: 0, ingredient: "turmeric" },
        { id: "sichuan", name: "Sichuan Peppercorn", price: 1, ingredient: "Sichuan peppercorn" },
      ],
    },
    {
      name: "Sweet & Deep",
      items: [
        { id: "honey", name: "Honey", price: 0, ingredient: "honey" },
        { id: "maple", name: "Maple Syrup", price: 0, ingredient: "maple syrup" },
        { id: "brown-sugar", name: "Brown Sugar", price: 0, ingredient: "brown sugar" },
        { id: "cacao", name: "Cacao", price: 1, ingredient: "cacao" },
        { id: "coffee", name: "Coffee", price: 0, ingredient: "coffee" },
      ],
    },
  ],

  // Step 5: bottle size and base price.
  sizes: [
    { id: "5oz", name: "5 fl oz", volume: "148 mL", price: 12 },
    { id: "10oz", name: "10 fl oz", volume: "296 mL", price: 20 },
  ],
};
