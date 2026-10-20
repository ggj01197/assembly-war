import type Phaser from 'phaser';
import { PARTS } from '../data/parts';
import { stageById } from '../data/stages';
import { Battle, type Deck } from '../domain/battle/sim';
import { settle, settleSurvival } from '../domain/rewards';
import { store, boot, update, flushSave } from '../game/store';
import { loadSprites } from '../game/unitLayout';
import { setSoundEnabled, setHapticsEnabled, playMusic, preloadMusic } from '../native/audio';
import { runOpening } from './opening';
import { mountHangar } from './hangar';
import { mountAssembly } from './assembly';
import { mountResult, type ResultData } from './result';
import { BattleHud } from './battleHud';
import { commanderLevel } from '../domain/save';
import { cardLevel } from '../domain/supply';
import { ensureDaily, addProgress, todayStr, canWatchAd } from '../domain/daily';
import { adsSupported, initAds } from '../native/ads';

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
  setHapticsEnabled(!store.getState().save.settings.reducedMotion);

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
    const player: Deck = { cards: s.deck.map(build => ({ build, level: cardLevel(build, s.partLevels) })) };
    const enemy: Deck = { cards: stage.enemy.map(build => ({ build, level: stage.enemyLevel })) };
    const battle = new Battle(player, enemy, PARTS, (Date.now() & 0x7fffffff) >>> 0, {
      bots: [false, true], wattMult: [1, stage.enemyWattMult],
      skills: [s.loadout.skills, stage.enemySkills ?? []], heroes: [s.loadout.hero, stage.enemyHero ?? null],
      heroLevel: [commanderLevel(s.commanderExp).level, stage.enemyLevel],
      boss: stage.boss ?? null, survival: !!stage.survival, modules: true, rule: stage.rule ?? null,
    });
    if (current) screens[current].hide();
    current = null;
    if (stage.boss) preloadMusic('boss');
    playMusic(stage.survival ? 'survival' : 'battle');   // 보스는 나타나는 순간 전장에서 'boss' 로 바꾼다
    const finish = () => { game.scene.stop('battle'); };
    const cfg = {
      stage, battle, hud, reducedMotion: s.settings.reducedMotion,
      onEnd: (b: Battle) => {
        const res = b.result();
        const win = res.winner === 0;
        const cur = store.getState().save;
        const sv2 = stage.survival ? settleSurvival(cur, stage, res.seconds, win) : null;
        const settled = sv2 ?? settle(cur, stage, win, res.baseHp[0]);
        // 정산 + 오늘의 임무 진행(승리·생산·처치·포탑·스킬·영웅)
        const commit = () => {
          update(sv => {
            Object.assign(sv, settled.save);
            const n = ensureDaily(sv, todayStr()); if (n !== sv) Object.assign(sv, n);
            if (win) addProgress(sv, 'win', 1);
            addProgress(sv, 'deploy', res.spawned[0]); addProgress(sv, 'kills', res.kills[0]); addProgress(sv, 'towers', res.crowns[0]);
            addProgress(sv, 'skill', res.skillUses[0]); addProgress(sv, 'hero', res.heroDeploys[0]);
          });
          void flushSave();
        };
        hud.hide();
        const data: ResultData = { stage, battle: b, builds: s.deck, rewards: settled.rewards, win, quit: false, record: sv2?.record ?? false };
        // 5분 버티기에서 졌고 이어하기(광고)를 쓸 수 있으면 정산을 미뤄 둔다 — 이어하면 이 정산은 버리고 판이 계속된다
        if (stage.survival && !win && adsSupported() && b.continued < 1 && canWatchAd(store.getState().save, todayStr(), 'survival_continue')) {
          data.commit = commit;
          data.onContinue = () => { b.revive(); screens.result.hide(); current = null; playMusic('survival'); game.scene.start('battle', cfg); };
        } else commit();
        current = 'result'; playMusic('hangar'); screens.result.show(data);
        finish();
      },
      onQuit: () => { finish(); show('hangar'); },
    };
    game.scene.start('battle', cfg);
    (window as unknown as { __aw: { battle?: Battle } }).__aw.battle = battle;   // 점검 도구용
  }

  await runOpening(root);
  show('hangar');
  void initAds();   // 광고 SDK 시작 + iOS 추적 허용 창(ATT): 격납고가 뜬 뒤 한 번
  // 점검·스크린샷 도구가 화면을 직접 부를 수 있게 한다
  (window as unknown as { __aw: unknown }).__aw = { nav, show, store, startBattle };
}
