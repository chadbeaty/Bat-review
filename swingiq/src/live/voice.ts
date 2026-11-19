"use client";

export type VoiceFrequency = "every" | "fixes" | "every3";

/**
 * Short spoken cues through earbuds or the phone speaker (Web Speech API, on device, free).
 * Speech runs on its own system queue, so it never blocks camera processing.
 */
export const voice = {
  supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  },
  voices(): SpeechSynthesisVoice[] {
    if (!this.supported()) return [];
    return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  },
  /** iOS only allows speech after a tap. Call this from the "Start" button. */
  unlock() {
    if (!this.supported()) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  },
  say(text: string, voiceURI?: string | null) {
    if (!this.supported()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    const v = voiceURI ? this.voices().find((x) => x.voiceURI === voiceURI) : undefined;
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  },
};

/** Whether to speak after swing number n, given the player's setting and whether the cue is a fix. */
export function shouldSpeak(freq: VoiceFrequency, n: number, isFix: boolean): boolean {
  if (freq === "every") return true;
  if (freq === "fixes") return isFix;
  return n % 3 === 0;
}
