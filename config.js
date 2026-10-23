// Everything a shop owner needs to change lives in this file:
// brand name, ingredients, sizes, prices and where orders are sent.
window.SHOP = {
  name: "Ember & Almond",
  tagline: "Hot sauce with a protein kick. Made to order, just for you.",

  // Where orders are sent. Paste a form endpoint here (e.g. a Formspree,
  // Basin or Getform URL) and every order is POSTed to it as JSON.
  // Leave it empty to run in demo mode (orders are only shown on screen).
  orderEndpoint: "",

  currency: "USD",
  maxAddIns: 3,

  // Step 1: one pepper per bottle.
  peppers: [
    { id: "jalapeno", name: "Jalapeño", note: "Bright & mild", heat: 1, color: "#6b8f2a" },
    { id: "chipotle", name: "Chipotle", note: "Smoky & medium", heat: 2, color: "#7c3a1d" },
    { id: "habanero", name: "Habanero", note: "Fruity & hot", heat: 3, color: "#e0661b" },
    { id: "ghost", name: "Ghost Pepper", note: "Serious heat", heat: 4, color: "#b01522" },
  ],

  // Step 2: every bottle has almonds. Customers pick how.
  almondStyles: [
    { id: "smooth", name: "Smooth", note: "Blended in for a creamy body" },
    { id: "crunchy", name: "Crunchy", note: "Toasted bits for texture" },
  ],

  // Step 3: optional flavors. `price` is added per bottle (0 = free).
  addIns: [
    { id: "garlic", name: "Roasted garlic", price: 0 },
    { id: "lime", name: "Lime", price: 0 },
    { id: "honey", name: "Honey", price: 0 },
    { id: "ginger", name: "Ginger", price: 0 },
    { id: "cilantro", name: "Cilantro", price: 0 },
    { id: "paprika", name: "Smoked paprika", price: 0 },
    { id: "mango", name: "Mango", price: 1 },
    { id: "pineapple", name: "Pineapple", price: 1 },
  ],

  // Step 4: bottle size and base price.
  sizes: [
    { id: "5oz", name: "5 oz", price: 12 },
    { id: "10oz", name: "10 oz", price: 20 },
  ],
};
