import test from "node:test"; import assert from "node:assert/strict";
import { createVoice, speakable, explainError, loadPrefs, savePrefs, clampRate, speechSupport, VOICE_KEY, MAX_SPOKEN_CHARS } from "@/lib/voice";

// ── fakes for the browser APIs ──
function fakeWin({ input = true, output = true, voices = [{ voiceURI: "v1", name: "Alice", lang: "en-GB" }, { voiceURI: "v2", name: "Bob", lang: "en-US" }] } = {}) {
  const w = { navigator: { language: "en-IN" }, recs: [], spoken: [], cancels: 0, listeners: {} };
  if (input) w.SpeechRecognition = class { constructor() { w.recs.push(this); this.started = 0; this.aborted = 0; this.stopped = 0; } start() { this.started++; } stop() { this.stopped++; this.onend?.(); } abort() { this.aborted++; } };
  if (output) {
    w.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    w.speechSynthesis = { cancel() { w.cancels++; }, speak(u) { w.spoken.push(u); u.onstart?.(); }, getVoices: () => voices, addEventListener(e, f) { w.listeners[e] = f; }, removeEventListener() {} };
  }
  return w;
}
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const res = (o) => ({ type: "result", text: "You have 3 tasks today.", cards: [], ...o });
const mk = (opts = {}) => { const win = opts.win || fakeWin(), storage = opts.storage || mem(), changes = [], texts = []; const v = createVoice({ win, storage, onChange: (s) => changes.push(s), onTranscript: (t) => texts.push(t) }); return { v, win, storage, changes, texts }; };

test("support detection (no assumption of universal support)", () => {
  assert.deepEqual(speechSupport(fakeWin()), { input: true, output: true }); assert.deepEqual(speechSupport(fakeWin({ input: false, output: false })), { input: false, output: false });
  const w = fakeWin({ input: false }); w.webkitSpeechRecognition = class {}; assert.equal(speechSupport(w).input, true);   // Safari/Chrome prefix
});
test("UNSUPPORTED browser: clear message, nothing throws, typing is the fallback", () => {
  const { v } = mk({ win: fakeWin({ input: false, output: false }) }); assert.equal(v.state.input, "unsupported"); assert.match(v.state.message, /can still type/i);
  v.startListening(); assert.equal(v.state.input, "unsupported"); assert.equal(v.speak(res()), false); v.setSpeak(true); assert.equal(v.state.prefs.speak, false, "can't enable speech that doesn't exist");
});
test("listening starts ONLY on explicit call, once; never continuous; never a second session", () => {
  const { v, win } = mk(); assert.equal(win.recs.length, 0, "nothing starts by itself"); v.startListening(); v.startListening(); v.startListening();
  assert.equal(win.recs.length, 1); assert.equal(win.recs[0].started, 1); assert.equal(win.recs[0].continuous, false); assert.equal(win.recs[0].interimResults, true); assert.equal(win.recs[0].lang, "en-IN"); assert.equal(v.state.input, "listening");
});
test("recognised text goes to the input for REVIEW — it is never auto-submitted", () => {
  const { v, win, texts } = mk(); v.startListening(); const r = win.recs[0];
  r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "add task buy" }], { isFinal: false })] }); assert.equal(v.state.interim, "add task buy"); assert.deepEqual(texts, [], "interim text isn't delivered as a command");
  r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: " add task buy milk " }], { isFinal: true })] });
  assert.deepEqual(texts, ["add task buy milk"]); assert.equal(v.state.input, "recognized"); assert.match(v.state.message, /Review or edit/); r.onend(); assert.equal(v.state.input, "recognized", "stays 'recognized' after the session ends");
});
test("PERMISSION DENIED, no speech, no mic, network, unknown — each has its own clear state", () => {
  for (const [code, state, re] of [["not-allowed", "denied", /blocked/i], ["service-not-allowed", "denied", /blocked/i], ["no-speech", "error", /didn’t hear/i], ["audio-capture", "error", /No microphone/i], ["network", "error", /internet/i], ["weird", "error", /type instead/i]]) {
    const { v, win } = mk(); v.startListening(); win.recs[0].onerror({ error: code }); assert.equal(v.state.input, state, code); assert.match(v.state.message, re, code);
  }
  assert.equal(explainError("language-not-supported").state, "error");
});
test("CANCELLED recognition: abort + 'cancelled' state, nothing delivered, and the mic can be used again", () => {
  const { v, win, texts } = mk(); v.startListening(); v.cancelListening(); assert.equal(win.recs[0].aborted, 1); assert.equal(v.state.input, "cancelled"); assert.deepEqual(texts, []);
  v.startListening(); assert.equal(win.recs.length, 2); assert.equal(v.state.input, "listening");
});
test("ending with no result says so (no silent failure)", () => { const { v, win } = mk(); v.startListening(); win.recs[0].onend(); assert.equal(v.state.input, "idle"); assert.match(v.state.message, /didn’t catch/i); });
test("a failing start() (e.g. already running) degrades to an error, not an exception", () => {
  const win = fakeWin(); win.SpeechRecognition = class { start() { throw new Error("InvalidStateError"); } }; const { v } = mk({ win }); v.startListening(); assert.equal(v.state.input, "error");
});

test("SPOKEN REPLIES ARE OFF BY DEFAULT and nothing is spoken until enabled", () => {
  const { v, win } = mk(); assert.equal(v.state.prefs.speak, false); assert.equal(v.speak(res()), false); assert.equal(win.spoken.length, 0);
});
test("enabled: speaks a concise version; every new reply CANCELS the previous one (no overlap)", () => {
  const { v, win } = mk(); v.setSpeak(true); const c0 = win.cancels; assert.equal(v.speak(res({ text: "First answer." })), true); assert.equal(v.speak(res({ text: "Second answer." })), true);
  assert.deepEqual(win.spoken.map((u) => u.text), ["First answer.", "Second answer."]); assert.ok(win.cancels - c0 >= 2, "synth.cancel() before each utterance"); assert.equal(v.state.speaking, true);
});
test("STOP speaking works immediately", () => { const { v, win } = mk(); v.setSpeak(true); v.speak(res()); const c = win.cancels; v.stopSpeaking(); assert.ok(win.cancels > c); assert.equal(v.state.speaking, false); });
test("turning spoken replies off stops speech at once and persists", () => {
  const { v, win, storage } = mk(); v.setSpeak(true); v.speak(res()); const c = win.cancels; v.setSpeak(false); assert.ok(win.cancels > c); assert.equal(JSON.parse(storage.m.get(VOICE_KEY)).speak, false);
});
test("speech doesn't interfere with recognition: starting the mic stops speech; nothing is spoken while listening", () => {
  const { v, win } = mk(); v.setSpeak(true); v.speak(res()); const c = win.cancels; v.startListening(); assert.ok(win.cancels > c, "speech stopped before listening"); assert.equal(v.speak(res()), false, "no speaking while the mic is open");
});
test("voice selection and rate are applied and persisted (rate clamped)", () => {
  const { v, win, storage } = mk(); v.setSpeak(true); v.setVoice("v2"); v.setRate(5); v.speak(res()); const u = win.spoken.at(-1); assert.equal(u.voice.name, "Bob"); assert.equal(u.rate, 1.5); assert.equal(u.lang, "en-US");
  assert.deepEqual(JSON.parse(storage.m.get(VOICE_KEY)), { speak: true, voiceURI: "v2", rate: 1.5 }); assert.equal(clampRate(0), 1); assert.equal(clampRate(0.1), 0.7);
  v.setVoice("gone"); v.speak(res()); assert.equal(win.spoken.at(-1).voice, undefined, "an unknown voice falls back to the default");
});
test("preferences survive a reload; corrupt storage falls back to safe defaults", () => {
  const storage = mem(); savePrefs(storage, { speak: true, voiceURI: "v1", rate: 1.2 }); assert.deepEqual(loadPrefs(storage), { speak: true, voiceURI: "v1", rate: 1.2 });
  storage.setItem(VOICE_KEY, "{not json"); assert.deepEqual(loadPrefs(storage), { speak: false, voiceURI: "", rate: 1 }); assert.deepEqual(loadPrefs(null), { speak: false, voiceURI: "", rate: 1 });
  storage.setItem(VOICE_KEY, JSON.stringify({ speak: "yes", rate: 99, voiceURI: 5 })); assert.deepEqual(loadPrefs(storage), { speak: false, voiceURI: "", rate: 1.5 });
});
test("blocked autoplay is reported with guidance", () => {
  const { v, win } = mk(); v.setSpeak(true); v.speak(res()); win.spoken[0].onerror({ error: "not-allowed" }); assert.match(v.state.message, /blocked spoken replies/i); assert.equal(v.state.speaking, false);
});
test("dispose stops everything (no leaks when the component unmounts)", () => { const { v, win } = mk(); v.startListening(); v.setSpeak(true); v.dispose(); assert.equal(win.recs[0].aborted, 1); });

test("speakable(): concise, plain text; long and structured replies are not read verbatim", () => {
  assert.equal(speakable(res({ text: "**3 tasks** due [today](/tasks) — see https://x.y/z" })), "3 tasks due today — see a link");
  const long = Array.from({ length: 40 }, (_, i) => `Task number ${i} is due.`).join(" "); const s = speakable(res({ text: long }));
  assert.ok(s.length <= MAX_SPOKEN_CHARS + 30, s.length); assert.match(s, /The rest is on screen\.$/);
  assert.match(speakable(res({ text: "Here you go.", cards: [{ items: [1, 2, 3, 4, 5] }] })), /full list is on screen/);
  assert.equal(speakable(res({ text: "", cards: [{ items: [] }] })), "Here’s what I found. The details are on screen."); assert.equal(speakable(res({ text: "" })), ""); assert.equal(speakable(null), "");
  assert.equal(speakable({ type: "error", text: "internal stack trace…" }), "Sorry, that didn’t work.", "never reads error internals aloud");
  assert.ok(!/```|`/.test(speakable(res({ text: "run `npm test` ```code block``` done" }))));
});
