import type { Scene } from '../data/cutscenes';
import { esc } from './unitView';
import { play } from '../native/audio';

/**
 * 컷신 재생: 그림 위에 대사 상자가 타자처럼 나온다. 화면을 누르면 글이 끝까지 나오고, 다시 누르면 다음 줄·다음 컷. 건너뛰기 단추는 언제나 보인다.
 * 「움직임 줄이기」 설정이면 글자가 한꺼번에 나오고 그림 줌이 없다. 자동 시험(webdriver)에서는 `?cuts=1` 이 없으면 건너뛴다.
 */
export function playCutscene(root: HTMLElement, scene: Scene, calm = false): Promise<void> {
  return new Promise(resolve => {
    const auto = !!navigator.webdriver && !/[?&]cuts=1/.test(location.search);
    if (auto || scene.cuts.length === 0) { resolve(); return; }
    const el = document.createElement('div');
    el.className = 'overlay cutscene' + (calm ? ' calm' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `컷신 ${scene.title}`);
    el.innerHTML = `<div class="cs-img" id="csImg"></div><div class="cs-vig"></div>
      <div class="cs-title">${esc(scene.title)}</div>
      <button class="cs-skip" type="button">건너뛰기</button>
      <div class="cs-dots" id="csDots">${scene.cuts.map(() => '<i></i>').join('')}</div>
      <div class="cs-box" id="csBox"><b class="cs-who" id="csWho"></b><p class="cs-tx" id="csTx"></p><span class="cs-next" aria-hidden="true">▼</span></div>`;
    root.appendChild(el);
    const img = el.querySelector('#csImg') as HTMLElement, who = el.querySelector('#csWho') as HTMLElement, tx = el.querySelector('#csTx') as HTMLElement;
    const dots = [...el.querySelectorAll('#csDots i')] as HTMLElement[];
    let cut = 0, line = 0, typing: ReturnType<typeof setInterval> | null = null, full = '', done = false;

    const finish = () => { if (done) return; done = true; if (typing) clearInterval(typing); el.classList.add('out'); setTimeout(() => { el.remove(); resolve(); }, 350); };
    const showCut = () => {
      const c = scene.cuts[cut];
      img.style.backgroundImage = `url(${c.img})`; img.classList.remove('zoom'); void img.offsetWidth; img.classList.add('zoom');
      dots.forEach((d, i) => d.className = i === cut ? 'on' : i < cut ? 'past' : '');
      line = 0; showLine();
    };
    const showLine = () => {
      const l = scene.cuts[cut].lines[line];
      who.textContent = l.who; who.hidden = !l.who; full = l.text; tx.textContent = '';
      el.classList.toggle('narr', !l.who);
      if (typing) clearInterval(typing);
      if (calm) { tx.textContent = full; typing = null; return; }
      let i = 0;
      typing = setInterval(() => { i++; tx.textContent = full.slice(0, i); if (i >= full.length && typing) { clearInterval(typing); typing = null; } }, 32);
    };
    const advance = () => {
      if (done) return;
      if (typing) { clearInterval(typing); typing = null; tx.textContent = full; return; }   // 글이 나오는 중이면 끝까지
      play('uiClick');
      if (line + 1 < scene.cuts[cut].lines.length) { line++; showLine(); return; }
      if (cut + 1 < scene.cuts.length) { cut++; showCut(); return; }
      finish();
    };
    el.onclick = e => { if ((e.target as HTMLElement).closest('.cs-skip')) return; advance(); };
    (el.querySelector('.cs-skip') as HTMLButtonElement).onclick = e => { e.stopPropagation(); play('uiBack'); finish(); };
    showCut();
  });
}
