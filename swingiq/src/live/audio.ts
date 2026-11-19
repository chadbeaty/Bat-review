"use client";
import { ContactListener } from "@/engine/contact";

/**
 * Listens to the mic for bat-ball contact. Times are converted to the page clock (performance.now()) so they line up
 * with camera frames. Echo cancellation, noise suppression and auto gain are turned off when the stream is requested
 * (see engine.ts): all three smear the sharp crack we're listening for.
 */
export class ContactAudio {
  readonly listener = new ContactListener();
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  /** Called on every onset (for the live "heard contact" flash). */
  onOnset?: (t: number) => void;

  async start(stream: MediaStream) {
    if (!stream.getAudioTracks().length) return false;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    await this.ctx.audioWorklet.addModule("/worklets/contact-energy.js");
    this.src = this.ctx.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(this.ctx, "contact-energy", { numberOfInputs: 1, numberOfOutputs: 0 });
    this.node.port.onmessage = (e: MessageEvent<Float64Array>) => {
      // Messages can still arrive just after the session stops.
      if (!this.ctx) return;
      const data = e.data;
      const offset = this.clockOffset();
      for (let i = 0; i < data.length; i += 2) {
        const t = data[i] * 1000 + offset;
        const onset = this.listener.push(t, data[i + 1]);
        if (onset !== null) this.onOnset?.(onset);
      }
    };
    this.src.connect(this.node);
    return true;
  }

  /** Page clock minus audio clock, in ms. */
  private clockOffset(): number {
    const ctx = this.ctx!;
    const ts = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;
    if (ts && ts.performanceTime && ts.contextTime !== undefined) {
      // Output timestamps are measured at the speaker; subtract the output latency to get back to "now".
      return ts.performanceTime - ts.contextTime * 1000 - (ctx.outputLatency ?? 0) * 1000;
    }
    return performance.now() - ctx.currentTime * 1000;
  }

  async stop() {
    if (this.node) this.node.port.onmessage = null;
    this.src?.disconnect();
    this.node?.disconnect();
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
