// Audio worklet for bat-ball contact detection. It high-passes the mic signal (contact is a sharp, high-frequency
// crack; voices and cage hum are lower) and reports the energy of each 128-sample block, batched every ~50 ms.
// The onset logic lives in src/engine/contact.ts so it can be tested.
class ContactEnergy extends AudioWorkletProcessor {
  constructor() {
    super();
    this.prevIn = 0;
    this.prevOut = 0;
    // One-pole high-pass around 2 kHz.
    const rc = 1 / (2 * Math.PI * 2000);
    const dt = 1 / sampleRate;
    this.a = rc / (rc + dt);
    this.batch = [];
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      let sum = 0;
      for (let i = 0; i < ch.length; i++) {
        const y = this.a * (this.prevOut + ch[i] - this.prevIn);
        this.prevIn = ch[i];
        this.prevOut = y;
        sum += y * y;
      }
      this.batch.push(currentTime, Math.sqrt(sum / ch.length));
      if (this.batch.length >= 36) {
        this.port.postMessage(new Float64Array(this.batch));
        this.batch = [];
      }
    }
    return true;
  }
}
registerProcessor("contact-energy", ContactEnergy);
