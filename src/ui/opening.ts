import { play, unlockAudio, playMusic } from '../native/audio';

/**
 * 스튜디오 공통 오프닝 (합패 `board.html #intro` · `board.js INTRO` 이식, STUDIO_OPENING_SPEC.md).
 * 순서·타이밍·글씨체·건너뛰기는 합패와 같고 좌표·크기만 세로(390×844)용이다.
 * S 스튜디오(0~2.1초) → T 타이틀(글자가 0.3초 간격으로 내려앉음, 「화면을 눌러 시작」) → G 진입(터치 후 0.95초).
 */
const TITLE = '조립전쟁';
const SUBTITLE = '부품을 조립해 싸우는 3분 전투';

interface Spark { x: number; y: number; vx: number; vy: number; r: number; a: number; chip: boolean; rot: number; vr: number; ph: number; hot: boolean }

export function runOpening(root: HTMLElement): Promise<void> {
  return new Promise(resolve => {
    const auto = !!navigator.webdriver && !/[?&]intro=1/.test(location.search); // 자동 시험은 건너뛴다
    if (auto) { resolve(); return; }

    const el = document.createElement('div');
    el.className = 'overlay intro s';
    el.innerHTML = `
      <div class="in-bg" id="inBg"></div>
      <canvas class="in-fx" id="inFx"></canvas>
      <div class="in-vig"></div>
      <div class="in-studio"><small>SHORT APP STUDIO</small><b>presents</b></div>
      <div class="in-title">
        <div class="in-logo">${[...TITLE].map(c => `<span>${c}</span>`).join('')}</div>
        <div class="in-sub">${SUBTITLE}</div>
      </div>
      <div class="in-tap">화면을 눌러 시작</div>
      <div class="in-flash"></div>
      <button class="in-skip" type="button">건너뛰기</button>`;
    root.appendChild(el);
    (el.querySelector('#inBg') as HTMLElement).style.setProperty('--img', 'url(art/hangar_bg.jpg)');

    const cv = el.querySelector('#inFx') as HTMLCanvasElement;
    const cx = cv.getContext('2d')!;
    const fit = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
    fit(); window.addEventListener('resize', fit);

    let raf = 0, phase = 0, titleAt = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (f: () => void, ms: number) => { timers.push(setTimeout(f, ms)); };

    const spawn = (init: boolean): Spark => ({
      x: Math.random() * cv.width, y: init ? Math.random() * cv.height : cv.height + 10 + Math.random() * 40,
      vx: (Math.random() - 0.5) * 0.4, vy: -(0.3 + Math.random() * 1.0), r: 1 + Math.random() * 2.2, a: 0.3 + Math.random() * 0.7,
      chip: Math.random() < 0.1, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.04, ph: Math.random() * 6.28, hot: Math.random() < 0.7,
    });
    const sparks: Spark[] = Array.from({ length: 56 }, () => spawn(true));

    function frame() {
      cx.clearRect(0, 0, cv.width, cv.height);
      for (const p of sparks) {
        p.ph += 0.03; p.x += p.vx + Math.sin(p.ph) * 0.3; p.y += p.vy; p.rot += p.vr;
        if (p.y < -30) Object.assign(p, spawn(false));
        cx.globalAlpha = p.a * Math.min(1, p.y / 120 + 0.2);
        if (p.chip) { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = '#9fb4cc'; cx.fillRect(-5, -3, 10, 6); cx.restore(); }
        else { cx.fillStyle = p.hot ? '#ffb347' : '#fff3d6'; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.283); cx.fill(); }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    let finished = false;
    function end() {
      if (finished) return; finished = true;
      cancelAnimationFrame(raf); timers.forEach(clearTimeout); window.removeEventListener('resize', fit);
      el.remove(); resolve();
    }
    function toTitle() {
      if (phase >= 1) return; phase = 1; titleAt = Date.now();
      el.classList.remove('s'); el.classList.add('t');
      later(() => play('logoHit'), 700);
      later(() => play('stamp'), 1000);
      playMusic('hangar'); // 타이틀부터 곡이 시작된다 (합패와 같은 순서: 오프닝 곡 → 메뉴 곡)
      // 글자 수가 4 보다 많으면 0.3초씩 늘려 내려앉힌다 (기준: 합패 2글자 .7/1.0초)
      el.querySelectorAll<HTMLElement>('.in-logo span').forEach((s, i) => { s.style.animationDelay = `${0.7 + i * 0.3}s`; });
    }
    function enter() {
      if (phase !== 1) return; phase = 2;
      play('uiClick'); play('packBurst');
      el.classList.add('go'); later(end, 950);
    }
    el.addEventListener('pointerdown', e => {
      unlockAudio();
      if ((e.target as HTMLElement).closest('.in-skip')) return;
      if (phase === 0) toTitle(); else if (phase === 1 && Date.now() - titleAt > 600) enter();
    });
    (el.querySelector('.in-skip') as HTMLButtonElement).onclick = () => { if (phase < 2) end(); };
    later(toTitle, 2100);
  });
}
