import type Phaser from 'phaser';
import { PARTS } from '../data/parts';
import { stageById, opLevel, OP_DAILY_CAP, RUSH_BONUS, weekKey } from '../data/stages';
import { Battle, type Deck } from '../domain/battle/sim';
import { settle, settleSurvival, settleOp, settleTower, settleRush } from '../domain/rewards';
import { store, boot, update, flushSave } from '../game/store';
import { loadSprites } from '../game/unitLayout';
import { setSoundEnabled, setHapticsEnabled, playMusic, preloadMusic } from '../native/audio';
import { runOpening } from './opening';
import { mountHangar } from './hangar';
import { mountAssembly } from './assembly';
import { mountRun } from './run';
import { RunBattleHud } from './runHud';
import type { BattlePlan } from '../domain/run/run';
import type { Stage } from '../data/stages';
import { mountResult, type ResultData } from './result';
import { BattleHud } from './battleHud';
import { commanderLevel } from '../domain/save';
import { cardLevel } from '../domain/supply';
import { ensureDaily, addProgress, todayStr, canWatchAd } from '../domain/daily';
import { addWeekly } from '../domain/goals';
import { settleRank } from '../domain/rank';
import { playCutscene } from './cutscene';
import { storyOf } from '../data/story';
import { sceneById, chapterScene, END_SCENE } from '../data/cutscenes';
import { activeSeason, addSeasonPoints, battlePoints, settleEvent, EVENT_WIN_POINTS } from '../domain/season';
import { adsSupported, initAds } from '../native/ads';

export interface Screen { el: HTMLElement; show(arg?: unknown): void; hide(): void }
export interface Nav {
  goHangar(sel?: number): void;
  openAssembly(slot: number): void;
  startBattle(stageId: string): void;
  /** 조립 런 */
  openRun(): void;
  /** 조립 런 한 라운드의 자동 전투를 시작한다. 끝나면 done('win'|'lose'|'quit') */
  runBattle(plan: BattlePlan, info: { round: number; rounds: number; hearts: number; seed: number }, done: (r: 'win' | 'lose' | 'quit') => void): void;
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
    openRun: () => { show('run'); },
    runBattle: (plan, info, done) => { runBattle(plan, info, done); },
  };
  const screens = { hangar: mountHangar(root, nav), assembly: mountAssembly(root, nav), result: mountResult(root, nav), run: mountRun(root, nav) } as const;
  const hud = new BattleHud(root);
  const runHud = new RunBattleHud(root);
  type Name = keyof typeof screens;
  let current: Name | null = null;

  /** 컷신 한 번 보기: 본 것으로 기록하고(건너뛰기 포함) 끝나면 이어진다 */
  async function cutOnce(id: string): Promise<void> {
    const sc = sceneById(id), s = store.getState().save;
    if (!sc || s.cuts.includes(id)) return;
    update(sv => { if (!sv.cuts.includes(id)) sv.cuts.push(id); });
    void flushSave();
    await playCutscene(root, sc, s.settings.reducedMotion);
  }
  /** 작전을 처음 이겨 해금한 이야기를 한 토막 보여 준다(결과 화면 위) */
  async function showStory(id: string): Promise<void> {
    const b = storyOf(id); if (!b) return;
    await playCutscene(root, { id: 'story-' + id, title: `📖 새 이야기 · ${b.title}`, cuts: [{ img: b.img, lines: b.lines }] }, store.getState().save.settings.reducedMotion);
  }
  /** 마지막 전투(3-7)를 처음 이기면 엔딩 컷신을 격납고로 돌아갈 때 보여 준다 */
  let pendingEnd = false;

  function show(name: Name, arg?: unknown) {
    if (name === 'hangar' && pendingEnd) { pendingEnd = false; void cutOnce(END_SCENE).then(() => show('hangar', arg)); return; }
    if (current && current !== name) screens[current].hide();
    hud.hide();
    current = name;
    playMusic('hangar');
    screens[name].show(arg);
  }

  /** 조립 런: 같은 전장 장면을 자동 전투 모드(skirmish)로 쓴다 */
  function runBattle(plan: BattlePlan, info: { round: number; rounds: number; hearts: number; seed: number }, done: (r: 'win' | 'lose' | 'quit') => void) {
    const s = store.getState().save;
    const battle = new Battle(plan.mineDeck, plan.foeDeck, PARTS, info.seed, { skirmish: { mine: plan.mine, foe: plan.foe, mods: plan.mods, limitSec: plan.limitSec } });
    if (current) screens[current].hide();
    current = null;
    runHud.configure(info);
    playMusic('battle');
    const back = (r: 'win' | 'lose' | 'quit') => { game.scene.stop('battle'); runHud.hide(); current = 'run'; playMusic('hangar'); done(r); };
    game.scene.start('battle', {
      stage: {} as Stage, battle, hud: runHud, reducedMotion: s.settings.reducedMotion, speed: runHud.speed, skip: runHud.skip,
      onEnd: (b: Battle) => back(b.result().winner === 0 ? 'win' : 'lose'), onQuit: () => back('quit'),
    });
    const dbg = (window as unknown as { __aw?: { battle?: Battle } }).__aw; if (dbg) dbg.battle = battle;
  }

  /** 보스 러시: 앞 보스를 이긴 뒤 남은 기지 체력 */
  let rushHp = 1000;

  async function startBattle(stageId: string) {
    const stage0 = stageById(stageId); if (!stage0) return;
    if (stage0.event && !activeSeason(todayStr())) return;   // 시즌이 열려 있을 때만
    if (!stage0.op && !stage0.tower && !stage0.rush && !stage0.rank && !stage0.event && !stage0.survival && stage0.no === 1) await cutOnce(chapterScene(stage0.chapter));   // 장의 첫 작전 전에 장 컷신
    const s = store.getState().save;
    const stage = stage0.op !== undefined || stage0.event ? { ...stage0, enemyLevel: opLevel(s.stages) } : stage0;   // 요일 작전은 진행도에 맞춰 적 레벨이 정해진다
    const player: Deck = { cards: s.deck.map(build => ({ build, level: cardLevel(build, s.partLevels) })) };
    const enemy: Deck = { cards: stage.enemy.map(build => ({ build, level: stage.enemyLevel })) };
    const battle = new Battle(player, enemy, PARTS, (Date.now() & 0x7fffffff) >>> 0, {
      bots: [false, true], wattMult: [1, stage.enemyWattMult],
      skills: [s.loadout.skills, stage.enemySkills ?? []], heroes: [s.loadout.hero, stage.enemyHero ?? null],
      heroLevel: [commanderLevel(s.commanderExp).level, stage.enemyLevel],
      boss: stage.boss ?? null, survival: !!stage.survival, modules: true, hand: true, rule: stage.rule ?? null,
      startHp: stage.rush && stage.rush > 1 ? [Math.min(1000, Math.max(400, rushHp) + 250), 1000] : undefined,
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
        const newStory = win && !!storyOf(stage.id) && !store.getState().save.story.includes(stage.id) ? stage.id : null;
        if (win && stage.id === 'c3-7' && !store.getState().save.cuts.includes(END_SCENE)) pendingEnd = true;
        if (stage.rush) rushHp = win ? res.baseHp[0] : 1000;
        const tw = stage.tower ? settleTower(cur, stage, win) : null;
        const rk = stage.rank ? settleRank(cur, stage, win, weekKey()) : null;
        const ev = stage.event ? settleEvent(cur, stage, win, todayStr()) : null;
        const settled = sv2 ?? tw ?? rk ?? ev ?? (stage.op !== undefined ? settleOp(cur, stage, win, todayStr(), OP_DAILY_CAP) : stage.rush ? settleRush(cur, stage, win, weekKey(), RUSH_BONUS) : settle(cur, stage, win, res.baseHp[0]));
        // 정산 + 오늘의 임무 진행(승리·생산·처치·포탑·스킬·영웅)
        const commit = () => {
          update(sv => {
            // 5분 버티기 지연 정산: 결과 화면에서 광고 등으로 세이브가 바뀌었을 수 있으니 지금 세이브를 기준으로 다시 계산한다 (예전에는 낡은 스냅샷이 덮어썼다)
            const fresh = stage.survival ? settleSurvival(sv, stage, res.seconds, win) : settled;
            Object.assign(sv, fresh.save);
            const n = ensureDaily(sv, todayStr()); if (n !== sv) Object.assign(sv, n);
            if (win) addProgress(sv, 'win', 1);
            addProgress(sv, 'deploy', res.spawned[0]); addProgress(sv, 'kills', res.kills[0]); addProgress(sv, 'towers', res.crowns[0]);
            addProgress(sv, 'skill', res.skillUses[0]); addProgress(sv, 'hero', res.heroDeploys[0]);
            if (newStory && !sv.story.includes(newStory)) sv.story.push(newStory);
            // 주간 과제
            const wk = weekKey();
            if (win) { addWeekly(sv, 'wins', wk); if (stage.op !== undefined) addWeekly(sv, 'ops', wk); if (stage.boss) addWeekly(sv, 'boss', wk); }
            if (tw?.record) addWeekly(sv, 'tower', wk);
            // 시즌 포인트: 승리 10(패배 2) + 모드 보너스(요일·탑 새 층·러시 마지막·랭크 승리·보스 5, 별빛 방어전 25)
            addSeasonPoints(sv, todayStr(), battlePoints(win, (stage.op !== undefined ? 5 : 0) + (tw?.record ? 5 : 0) + (stage.rush === 3 ? 15 : 0) + (stage.rank ? 5 : 0) + (stage.boss ? 5 : 0) + (stage.event && ev?.full ? EVENT_WIN_POINTS : 0)));
            addWeekly(sv, 'hero', wk, res.heroDeploys[0]);
          });
          void flushSave();
        };
        hud.hide();
        const data: ResultData = { stage, battle: b, builds: s.deck, rewards: settled.rewards, win, quit: false, record: sv2?.record ?? tw?.record ?? false, note: rk?.note };
        // 5분 버티기에서 졌고 이어하기(광고)를 쓸 수 있으면 정산을 미뤄 둔다 — 이어하면 이 정산은 버리고 판이 계속된다
        if (stage.survival && !win && adsSupported() && b.continued < 1 && canWatchAd(store.getState().save, todayStr(), 'survival_continue')) {
          data.commit = commit;
          data.onContinue = () => { b.revive(); screens.result.hide(); current = null; playMusic('survival'); game.scene.start('battle', cfg); };
        } else commit();
        current = 'result'; playMusic('hangar'); screens.result.show(data);
        if (newStory) setTimeout(() => { void showStory(newStory); }, 700);
        finish();
      },
      onQuit: () => { finish(); show('hangar'); },
    };
    game.scene.start('battle', cfg);
    const dbg2 = (window as unknown as { __aw?: { battle?: Battle } }).__aw; if (dbg2) dbg2.battle = battle;   // 점검 도구용
  }

  await runOpening(root);
  show('hangar');
  void initAds();   // 광고 SDK 시작 + iOS 추적 허용 창(ATT): 격납고가 뜬 뒤 한 번
  // 점검·스크린샷 도구가 화면을 직접 부를 수 있게 한다
  if (import.meta.env.DEV) (window as unknown as { __aw: unknown }).__aw = { nav, show, store, startBattle, game };   // 점검 도구용 — 출시 빌드에는 노출하지 않는다(세이브 변조 방지)
}
