// JARVIS voice: browser-native speech recognition (input) and speech synthesis (output). PURE: the window/storage are injected, so every
// state can be unit-tested with fakes. Nothing here records, listens or speaks unless the user explicitly asks:
//   • listening starts only from a click on the mic (no wake word, never continuous) and never auto-submits — the text lands in the input to review
//   • spoken replies are OFF by default, use only the device's own voices (no text is sent to a TTS service), and can be stopped at any time
// Browser note: SpeechRecognition is implemented by the browser; in Chrome/Edge/Safari the audio is processed by the browser vendor's speech
// service (needs internet). Firefox doesn't support it. Typing always works.
export const VOICE_KEY = "lo.voice";
export const MAX_SPOKEN_CHARS = 280;
export const clampRate = (r) => Math.min(1.5, Math.max(0.7, Number(r) || 1));
export const getRecognitionCtor = (win) => win?.SpeechRecognition || win?.webkitSpeechRecognition || null;
export const speechSupport = (win) => ({ input: !!getRecognitionCtor(win), output: !!(win?.speechSynthesis && win?.SpeechSynthesisUtterance) });

export function loadPrefs(storage) {
  try { const p = JSON.parse(storage?.getItem(VOICE_KEY) || "{}"); return { speak: p.speak === true, voiceURI: typeof p.voiceURI === "string" ? p.voiceURI.slice(0, 300) : "", rate: clampRate(p.rate) }; }
  catch { return { speak: false, voiceURI: "", rate: 1 }; }                       // corrupt/unavailable storage → safe defaults (spoken replies off)
}
export function savePrefs(storage, prefs) { try { storage?.setItem(VOICE_KEY, JSON.stringify({ speak: !!prefs.speak, voiceURI: prefs.voiceURI || "", rate: clampRate(prefs.rate) })); return true; } catch { return false; } }

// Recognition error codes → what the UI should say.
export function explainError(code) {
  switch (code) {
    case "not-allowed": case "service-not-allowed": return { state: "denied", message: "Microphone access is blocked. Allow it in your browser’s site settings, or just type." };
    case "no-speech": return { state: "error", message: "I didn’t hear anything. Tap the mic and try again." };
    case "audio-capture": return { state: "error", message: "No microphone was found." };
    case "network": return { state: "error", message: "The browser’s speech service couldn’t be reached (voice input needs an internet connection)." };
    case "language-not-supported": return { state: "error", message: "This browser can’t recognise your language." };
    case "aborted": return { state: "cancelled", message: "Cancelled." };
    default: return { state: "error", message: "Voice input failed. You can type instead." };
  }
}

// A short, plain-text version of a JARVIS reply for speaking. The full written reply is untouched; long/structured replies are not read out.
export function speakable(res) {
  if (!res) return "";
  if (res.type === "error") return "Sorry, that didn’t work.";
  let t = String(res.text || "").replace(/```[\s\S]*?```/g, " ").replace(/`([^`]*)`/g, "$1").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "a link")
    .replace(/[*_#>~|]+/g, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\s+/g, " ").trim();
  if (!t) return res.cards?.length ? "Here’s what I found. The details are on screen." : "";
  if (t.length > MAX_SPOKEN_CHARS) { const cut = t.slice(0, MAX_SPOKEN_CHARS), i = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! ")); t = (i > 80 ? cut.slice(0, i + 1) : cut.replace(/\s+\S*$/, "")) + " The rest is on screen."; }
  else if (res.cards?.some((c) => (c.items?.length || 0) > 3)) t += " The full list is on screen.";
  return t;
}

export function createVoice({ win, storage, onChange = () => {}, onTranscript = () => {} }) {
  const support = speechSupport(win), synth = win?.speechSynthesis;
  const s = { support, input: support.input ? "idle" : "unsupported", message: support.input ? "" : "Voice input isn’t supported in this browser — you can still type.", interim: "", speaking: false, voices: [], prefs: loadPrefs(storage) };
  let rec = null, wantCancel = false, gotResult = false, disposed = false;
  const emit = () => { if (!disposed) onChange({ ...s, prefs: { ...s.prefs }, voices: s.voices }); };
  const set = (p) => { Object.assign(s, p); emit(); };
  const refreshVoices = () => { if (synth) { try { s.voices = (synth.getVoices() || []).map((v) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang })); } catch { s.voices = []; } emit(); } };
  synth?.addEventListener?.("voiceschanged", refreshVoices); refreshVoices();

  const api = {
    get state() { return { ...s, prefs: { ...s.prefs } }; },
    startListening() {
      if (!support.input) return set({ input: "unsupported", message: "Voice input isn’t supported in this browser — you can still type." });
      if (rec) return;                                                      // already listening: never open a second session
      api.stopSpeaking();                                                    // the mic must not hear JARVIS talking
      const Ctor = getRecognitionCtor(win); wantCancel = false; gotResult = false;
      try {
        rec = new Ctor(); rec.lang = win.navigator?.language || "en-US"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
        rec.onresult = (e) => { let fin = "", interim = ""; for (let i = e.resultIndex ?? 0; i < e.results.length; i++) { const r = e.results[i]; (r.isFinal ? (fin += r[0].transcript) : (interim += r[0].transcript)); }
          if (fin.trim()) { gotResult = true; const t = fin.trim().slice(0, 600); set({ input: "recognized", interim: "", message: "Review or edit, then press Send." }); onTranscript(t); } else if (interim) set({ interim }); };
        rec.onerror = (e) => { const x = explainError(e?.error); if (x.state === "cancelled" && !wantCancel) return; set({ input: x.state, message: x.message, interim: "" }); };
        rec.onend = () => { rec = null; if (s.input === "listening") set({ input: "idle", message: gotResult ? "" : "I didn’t catch anything.", interim: "" }); };
        set({ input: "listening", message: "Listening…", interim: "" }); rec.start();
      } catch (err) { rec = null; set({ input: "error", message: "Couldn’t start the microphone. You can type instead.", interim: "" }); }
    },
    stopListening() { try { rec?.stop(); } catch {} },                       // finish and deliver what was heard
    cancelListening() { if (!rec) return; wantCancel = true; try { rec.abort(); } catch {} rec = null; set({ input: "cancelled", message: "Cancelled.", interim: "" }); },
    speak(res) {
      if (!s.prefs.speak || !support.output || rec) return false;           // off by default; never while listening
      const text = speakable(res); if (!text) return false;
      try {
        synth.cancel();                                                      // never overlap two replies
        const u = new win.SpeechSynthesisUtterance(text); u.rate = clampRate(s.prefs.rate); u.lang = win.navigator?.language || "en-US";
        const v = s.prefs.voiceURI && (synth.getVoices() || []).find((x) => x.voiceURI === s.prefs.voiceURI); if (v) { u.voice = v; u.lang = v.lang || u.lang; }
        u.onstart = () => set({ speaking: true }); u.onend = () => set({ speaking: false }); u.onerror = (e) => set({ speaking: false, ...(e?.error === "not-allowed" ? { message: "Your browser blocked spoken replies — tap the speaker button once to allow them." } : {}) });
        synth.speak(u); return true;
      } catch { set({ speaking: false }); return false; }
    },
    stopSpeaking() { try { synth?.cancel(); } catch {} if (s.speaking) set({ speaking: false }); },
    setSpeak(on) { s.prefs.speak = !!on && support.output; if (!s.prefs.speak) api.stopSpeaking(); savePrefs(storage, s.prefs); emit(); },
    setVoice(uri) { s.prefs.voiceURI = String(uri || "").slice(0, 300); savePrefs(storage, s.prefs); emit(); },
    setRate(r) { s.prefs.rate = clampRate(r); savePrefs(storage, s.prefs); emit(); },
    dismissMessage() { if (s.input !== "listening") set({ input: support.input ? "idle" : "unsupported", message: support.input ? "" : s.message }); },
    dispose() { disposed = true; try { rec?.abort(); } catch {} rec = null; try { synth?.cancel(); } catch {} synth?.removeEventListener?.("voiceschanged", refreshVoices); },
  };
  return api;
}
