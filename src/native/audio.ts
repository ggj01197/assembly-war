/**
 * 효과음: 파일 없이 WebAudio 로 합성 (합패 `web/sfx.js` 이식 — STUDIO_OPENING_SPEC §4).
 * iOS 는 사람이 한 번 건드린 뒤에야 소리가 나므로 touchend·click·pointerdown 마다 깨운다 (룬 헌터 TD-084).
 * 5단계에서 ElevenLabs 파일이 생기면 같은 이름으로 바꿔 끼운다. BGM 도 그때 추가한다.
 */
import { App } from '@capacitor/app';
type Opt = { type?: OscillatorType; to?: number | null; a?: number };
type NOpt = { type?: BiquadFilterType; f?: number; to?: number | null; q?: number; a?: number };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
const lastPlayed: Record<string, number> = {};

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (!on) { if (musicCur) { stopTrack(musicCur); musicCur = null; } }   // 원하는 곡(musicWant)은 기억해 둔다
  else if (musicWant && !musicCur) playMusic(musicWant);                // 다시 켜면 그 곡을 이어서 튼다
}

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
  loadFiles();
  return ctx;
}

export function unlockAudio(): void {
  if (document.hidden) return;
  const c = ensure();
  if (c && c.state !== 'running') void c.resume();   // 'suspended' 뿐 아니라 전화·알람 뒤 iOS 의 'interrupted' 도 되살린다
  resumeMusic();
}
for (const ev of ['touchend', 'click', 'pointerdown', 'keydown']) window.addEventListener(ev, unlockAudio, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) { pauseMusic(); void ctx.suspend(); } else { void ctx.resume(); resumeMusic(); }
});
/** 앱을 나가면(홈 버튼·앱 전환) 소리를 멈춘다 — DOM visibilitychange 만으로는 iOS 앱에서 늦거나 안 올 수 있다 (STUDIO_LEARNINGS B-5). 돌아오면 현재 곡만 이어서. */
void App.addListener('appStateChange', ({ isActive }) => {
  if (!ctx) return;
  if (!isActive) { pauseMusic(); void ctx.suspend(); } else if (!document.hidden) { void ctx.resume(); resumeMusic(); }
}).catch(() => { /* 웹(브라우저)에서는 리스너가 없어도 된다 */ });

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
  laser: () => { tone(0, 1400, 0.16, 0.1, { type: 'sawtooth', to: 600 }); noise(0, 0.12, 0.08, { type: 'highpass', f: 5000 }); },
  blade: () => { noise(0, 0.1, 0.22, { f: 3200, to: 900, q: 1.4, a: 0.005 }); tone(0.02, 1800, 0.08, 0.06, { type: 'triangle', to: 900 }); },
  flak: () => { noise(0, 0.15, 0.25, { f: 1800, to: 500, q: 0.8 }); tone(0, 260, 0.12, 0.15, { type: 'square', to: 120 }); },
  repair: () => { tone(0, 660, 0.14, 0.09, { type: 'sine', to: 990 }); tone(0.08, 880, 0.14, 0.07, { type: 'sine', to: 1320 }); },
  mortar: () => { tone(0, 90, 0.35, 0.45, { to: 45 }); noise(0, 0.3, 0.3, { type: 'lowpass', f: 900, to: 150 }); tone(0.3, 140, 0.3, 0.25, { to: 60 }); },
  hit: () => { noise(0, 0.06, 0.15, { f: 1800, q: 1.5 }); },
  boom: () => { tone(0, 100, 0.4, 0.5, { to: 40 }); noise(0, 0.4, 0.35, { type: 'lowpass', f: 1400, to: 150 }); },
  baseHit: () => { tone(0, 70, 0.5, 0.6, { to: 35 }); noise(0, 0.5, 0.3, { type: 'lowpass', f: 700, to: 120 }); },
  win: () => { [392, 523.25, 659.25, 784].forEach((f, i) => tone(i * 0.12, f, 0.55, 0.16, { type: 'triangle' })); },
  lose: () => { [330, 262, 196].forEach((f, i) => tone(i * 0.18, f, 0.5, 0.16, { type: 'sawtooth', to: f * 0.8 })); },
};

/**
 * ElevenLabs 로 만든 효과음 파일 (public/audio/sfx/<이름>.mp3). 첫 터치로 오디오가 열리면 한꺼번에 내려받아 해독하고,
 * 아직 없거나 실패한 소리는 위 합성음이 그대로 나온다. 파일이 2~4초로 길게 나와서 이름마다 재생 길이 상한(초)을 둔다.
 */
const FILE_MAX: Record<string, number> = {
  gatling: 0.5, cannon: 1.0, missile: 1.1, laser: 0.6, blade: 0.5, flak: 0.9, repair: 0.9, mortar: 1.0, hit: 0.35, boom: 1.0, baseHit: 1.3,
  spawn: 0.8, uiClick: 0.2, uiBack: 0.25, deny: 0.4, win: 2.2, lose: 2.2, logoHit: 1.6, stamp: 0.6, packBurst: 1.1, ready: 0.3, pointCapture: 1.0,
};
const FILE_GAIN: Record<string, number> = { gatling: 0.7, hit: 0.8, uiClick: 0.8, spawn: 0.9 };
const bufs: Record<string, AudioBuffer> = {};
let loading = false;
function loadFiles(): void {
  if (loading || !ctx) return;
  loading = true;
  const c = ctx;
  for (const name of Object.keys(FILE_MAX)) {
    fetch(`audio/sfx/${name}.mp3`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(ab => { c.decodeAudioData(ab, b => { bufs[name] = b; }, () => { /* 해독 실패 → 합성음 */ }); })
      .catch(() => { /* 파일이 없으면 합성음 */ });
  }
}
function playFile(name: string): boolean {
  const b = bufs[name];
  if (!b || !ctx || !master) return false;
  const t = ctx.currentTime, cap = Math.min(b.duration, FILE_MAX[name] ?? b.duration);
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = b;
  g.gain.setValueAtTime(FILE_GAIN[name] ?? 1, t);
  g.gain.setValueAtTime(FILE_GAIN[name] ?? 1, t + Math.max(0, cap - 0.06));
  g.gain.linearRampToValueAtTime(0.0001, t + cap);
  src.connect(g); g.connect(master);
  src.start(t); src.stop(t + cap + 0.02);
  return true;
}

/** 같은 소리를 너무 자주 내지 않게 (전투 중 기관포 연사 등). minGap 은 밀리초. */
export function play(name: keyof typeof BANK | string, minGap = 0): void {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  if (c.state !== 'running') { if (!document.hidden) void c.resume(); return; }   // 'interrupted' 에서 되살린다
  const now = performance.now();
  if (minGap && now - (lastPlayed[name] ?? 0) < minGap) return;
  lastPlayed[name] = now;
  try { if (!playFile(name)) BANK[name]?.(); } catch { /* 소리 실패가 게임을 멈추게 하지 않는다 */ }
}

// ───────── BGM ─────────
// public/audio/bgm/<이름>.mp3 (ElevenLabs, 가사 없음 전사 확인).
// <audio> 로 스트리밍한다 — 2분 이상 곡을 decodeAudioData 로 통째 해독하면 아이폰에서 무음이 되고 PCM 이 곡당 44~110MB 라 네 곡이면 240MB 가 상주했다
// (STUDIO_LEARNINGS 「아이폰 BGM 무음」·B절, 레드팀 2026-10-27). 페이드는 createMediaElementSource → GainNode (아이폰은 <audio>.volume 이 안 먹는다).
export type MusicName = 'hangar' | 'battle' | 'boss' | 'survival';
const MUSIC_VOL = 0.32, FADE = 1.0;
type Cur = { name: MusicName; el: HTMLAudioElement; gain: GainNode | null; node: MediaElementAudioSourceNode | null };
let musicCur: Cur | null = null;
let musicWant: MusicName | null = null;

/** 스트리밍이라 미리 해독할 것이 없다 (이전 API 호환용) */
export function preloadMusic(_name: MusicName): void { /* 없음 */ }

function stopTrack(o: Cur): void {
  const kill = () => { try { o.el.pause(); o.el.removeAttribute('src'); o.el.load(); } catch { /* 이미 멈춤 */ } try { o.node?.disconnect(); o.gain?.disconnect(); } catch { /* 이미 끊김 */ } };
  if (ctx && o.gain) {
    const t = ctx.currentTime;
    o.gain.gain.cancelScheduledValues(t); o.gain.gain.setValueAtTime(o.gain.gain.value, t); o.gain.gain.linearRampToValueAtTime(0.0001, t + FADE);
    setTimeout(kill, (FADE + 0.1) * 1000);
  } else kill();
}

/** 배경 음악을 바꾼다. null 이면 서서히 끈다. 같은 곡이 이미 나오면 아무것도 안 한다. */
export function playMusic(name: MusicName | null): void {
  musicWant = name;
  if (!enabled && name) return;
  const c = ensure();
  if (!c || !master) return;
  if (musicCur && musicCur.name === name) return;
  if (musicCur) { stopTrack(musicCur); musicCur = null; }
  if (!name) return;
  const el = new Audio(`audio/bgm/${name}.mp3`);
  el.loop = true; el.preload = 'auto'; el.setAttribute('playsinline', '');
  let node: MediaElementAudioSourceNode | null = null, gain: GainNode | null = null;
  try {
    node = c.createMediaElementSource(el); gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, c.currentTime); gain.gain.linearRampToValueAtTime(MUSIC_VOL, c.currentTime + FADE);
    node.connect(gain); gain.connect(master);
  } catch { node = null; gain = null; el.volume = MUSIC_VOL; }   // 그래프를 못 만들면 요소 볼륨으로 (아이폰은 무시되지만 소리는 난다)
  musicCur = { name, el, gain, node };
  void el.play().catch(() => { /* 첫 터치 전이면 unlockAudio 가 다시 시도한다 */ });
}

/** 앱을 나가면 곡을 멈추고, 돌아오면 지금 곡만 이어서 튼다 */
function pauseMusic(): void { try { musicCur?.el.pause(); } catch { /* 무시 */ } }
function resumeMusic(): void { if (enabled && musicCur && musicCur.el.paused && !document.hidden) void musicCur.el.play().catch(() => { /* 다음 터치에서 */ }); }

/** 진동 (Capacitor Haptics). 웹·미지원 기기에서는 아무 일도 하지 않는다. 약 'light' · 중 'medium' · 강 'heavy' · 성공 'success' */
let hapticsOn = true;
export function setHapticsEnabled(on: boolean): void { hapticsOn = on; }
type HapticsMod = typeof import('@capacitor/haptics');
let hapticsMod: Promise<HapticsMod | null> | null = null;
export type Buzz = 'light' | 'medium' | 'heavy' | 'success';
export function buzz(kind: Buzz | number | number[] = 'light'): void {
  if (!hapticsOn) return;
  const k: Buzz = typeof kind === 'string' ? kind : 'light';
  hapticsMod ??= import('@capacitor/haptics').catch(() => null);
  void hapticsMod.then(m => {
    if (!m) return;
    try {
      if (k === 'success') void m.Haptics.notification({ type: m.NotificationType.Success }).catch(() => {});
      else void m.Haptics.impact({ style: k === 'heavy' ? m.ImpactStyle.Heavy : k === 'medium' ? m.ImpactStyle.Medium : m.ImpactStyle.Light }).catch(() => {});
    } catch { /* 진동 실패는 무시 */ }
  });
}
