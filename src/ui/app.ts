import type Phaser from 'phaser';
import { PARTS } from '../data/parts';
import { stageById } from '../data/stages';
import { Battle, type Deck } from '../domain/battle/sim';
import { settle } from '../domain/rewards';
import { store, boot, update, flushSave } from '../game/store';
import { loadSprites } from '../game/unitLayout';
import { setSoundEnabled, playMusic } from '../native/audio';
import { runOpening } from './opening';
import { mountHangar } from './hangar';
import { mountAssembly } from './assembly';
import { mountResult, type ResultData } from './result';
import { BattleHud } from './battleHud';
import { commanderLevel } from '../domain/save';

export interface Screen { el: HTMLElement; show(arg?: unknown): void; hide(): void }
export interface Nav {
  goHangar(sel?: number): void;
  openAssembly(slot: number): void;
  startBattle(stageId: string): void;
}

/** 화면 전환과 흐름: 오프닝 → 격납고 ↔ 조립 / 출격 → 전장 → 결과 → (다음 작전·다시 도전·조립·격납고) */
export async function startApp(game: Phaser.Game): Promise<void> {
  const root = document.getElementById('ui')!;
  await boot();
  await loadSprites();
  setSoundEnabled(store.getState().save.settings.sound);

  const nav: Nav = {
    goHangar: sel => { show('hangar', sel); },
    openAssembly: slot => { show('assembly', slot); },
    startBattle: id => { void startBattle(id); },
  };
  const screens = { hangar: mountHangar(root, nav), assembly: mountAssembly(root, nav), result: mountResult(root, nav) } as const;
  const hud = new BattleHud(root);
  type Name = keyof typeof screens;
  let current: Name | null = null;

  function show(name: Name, arg?: unknown) {
    if (current && current !== name) screens[current].hide();
    hud.hide();
    current = name;
    playMusic('hangar');
    screens[name].show(arg);
  }

  async function startBattle(stageId: string) {
    const stage = stageById(stageId); if (!stage) return;
    const s = store.getState().save;
    const player: Deck = { cards: s.deck.map(build => ({ build, level: 1 })) };
    const enemy: Deck = { cards: stage.enemy.map(build => ({ build, level: stage.enemyLevel })) };
    const battle = new Battle(player, enemy, PARTS, (Date.now() & 0x7fffffff) >>> 0, {
      bots: [false, true], wattMult: [1, stage.enemyWattMult],
      skills: [s.loadout.skills, stage.enemySkills ?? []], heroes: [s.loadout.hero, stage.enemyHero ?? null],
      heroLevel: [commanderLevel(s.commanderExp).level, stage.enemyLevel],
    });
    if (current) screens[current].hide();
    current = null;
    playMusic('battle');
    const finish = () => { game.scene.stop('battle'); };
    game.scene.start('battle', {
      stage, battle, hud, reducedMotion: s.settings.reducedMotion,
      onEnd: (b: Battle) => {
        const res = b.result();
        const win = res.winner === 0;
        const settled = settle(store.getState().save, stage, win, res.baseHp[0]);
        update(sv => { Object.assign(sv, settled.save); });
        void flushSave();
        hud.hide();
        const data: ResultData = { stage, battle: b, builds: s.deck, rewards: settled.rewards, win, quit: false };
        current = 'result'; playMusic('hangar'); screens.result.show(data);
        finish();
      },
      onQuit: () => { finish(); show('hangar'); },
    });
  }

  await runOpening(root);
  show('hangar');
  // 점검·스크린샷 도구가 화면을 직접 부를 수 있게 한다
  (window as unknown as { __aw: unknown }).__aw = { nav, show, store, startBattle };
}
