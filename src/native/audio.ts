/**
 * 효과음: 파일 없이 WebAudio 로 합성 (합패 `web/sfx.js` 이식 — STUDIO_OPENING_SPEC §4).
 * iOS 는 사람이 한 번 건드린 뒤에야 소리가 나므로 touchend·click·pointerdown 마다 깨운다 (룬 헌터 TD-084).
 * 5단계에서 ElevenLabs 파일이 생기면 같은 이름으로 바꿔 끼운다. BGM 도 그때 추가한다.
 */
type Opt = { type?: OscillatorType; to?: number | null; a?: number };
type NOpt = { type?: BiquadFilterType; f?: number; to?: number | null; q?: number; a?: number };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
const lastPlayed: Record<string, number> = {};

export function setSoundEnabled(on: boolean): void { enabled = on; }

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlockAudio(): void {
  if (document.hidden) return;
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume();
}
for (const ev of ['touchend', 'click', 'pointerdown', 'keydown']) window.addEventListener(ev, unlockAudio, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) void ctx.suspend(); else void ctx.resume();
});

function env(g: GainNode, t: number, a: number, d: number, peak: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(at: number, f: number, dur: number, vol: number, { type = 'sine', to = null, a = 0.004 }: Opt = {}) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, a, dur, vol);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + a + dur + 0.05);
}
function noise(at: number, dur: number, vol: number, { type = 'bandpass', f = 1000, to = null, q = 1, a = 0.003 }: NOpt = {}) {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, a, dur, vol);
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + a + dur + 0.05);
}

/** 금속 쿵·기계음 계열 (조립전쟁 오프닝용) */
const BANK: Record<string, () => void> = {
  logoHit: () => { tone(0, 80, 1.2, 0.95, { to: 38 }); tone(0.01, 220, 0.5, 0.3, { type: 'square', to: 90 }); noise(0, 0.9, 0.3, { type: 'lowpass', f: 800, to: 200 }); noise(0.04, 0.7, 0.2, { type: 'highpass', f: 3000 }); tone(0.05, 1760, 0.5, 0.06, { type: 'triangle' }); },
  stamp: () => { tone(0, 170, 0.1, 0.55, { to: 70 }); noise(0, 0.06, 0.4, { type: 'lowpass', f: 1500 }); tone(0.06, 1320, 0.12, 0.08, { type: 'square' }); },
  packBurst: () => { noise(0, 0.55, 0.35, { f: 500, to: 6000, q: 0.8, a: 0.02 }); tone(0.05, 988, 0.3, 0.1, { type: 'triangle' }); tone(0.1, 1480, 0.4, 0.07, { type: 'triangle' }); },
  uiClick: () => tone(0, 880, 0.05, 0.12, { type: 'triangle' }),
  uiBack: () => tone(0, 520, 0.06, 0.12, { type: 'triangle' }),
  deny: () => { tone(0, 200, 0.12, 0.2, { type: 'square' }); tone(0.1, 150, 0.14, 0.2, { type: 'square' }); },
  spawn: () => { noise(0, 0.18, 0.28, { f: 400, to: 2500, q: 0.8 }); tone(0, 330, 0.12, 0.12, { type: 'triangle', to: 660 }); },
  gatling: () => { noise(0, 0.05, 0.18, { f: 2400, q: 1.2 }); },
  cannon: () => { tone(0, 120, 0.25, 0.4, { to: 50 }); noise(0, 0.2, 0.3, { type: 'lowpass', f: 1200, to: 200 }); },
  missile: () => { noise(0, 0.35, 0.22, { f: 800, to: 4000, q: 0.8, a: 0.03 }); },
  hit: () => { noise(0, 0.06, 0.15, { f: 1800, q: 1.5 }); },
  boom: () => { tone(0, 100, 0.4, 0.5, { to: 40 }); noise(0, 0.4, 0.35, { type: 'lowpass', f: 1400, to: 150 }); },
  baseHit: () => { tone(0, 70, 0.5, 0.6, { to: 35 }); noise(0, 0.5, 0.3, { type: 'lowpass', f: 700, to: 120 }); },
  win: () => { [392, 523.25, 659.25, 784].forEach((f, i) => tone(i * 0.12, f, 0.55, 0.16, { type: 'triangle' })); },
  lose: () => { [330, 262, 196].forEach((f, i) => tone(i * 0.18, f, 0.5, 0.16, { type: 'sawtooth', to: f * 0.8 })); },
};

/** 같은 소리를 너무 자주 내지 않게 (전투 중 기관포 연사 등). minGap 은 밀리초. */
export function play(name: keyof typeof BANK | string, minGap = 0): void {
  if (!enabled) return;
  const c = ensure();
  if (!c || c.state !== 'running') return;
  const now = performance.now();
  if (minGap && now - (lastPlayed[name] ?? 0) < minGap) return;
  lastPlayed[name] = now;
  try { BANK[name]?.(); } catch { /* 소리 실패가 게임을 멈추게 하지 않는다 */ }
}

/** 진동 (Capacitor Haptics 는 5단계 설정 연동 때 연결) */
export function buzz(_ms: number | number[]): void { /* 후속 */ }
