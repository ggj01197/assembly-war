import { describe, it, expect } from 'vitest';
import { Battle, BASE_HP, TICK_HZ, basePos, type Deck } from './sim';
import { PARTS } from '../../data/parts';
import { HEROES, SKILLS, HERO_WATT, HERO_RESPAWN_SEC, repairLoadout, defaultLoadout } from '../loadout';
import { assemble } from '../assemble';
import { defaultSave, repairSave } from '../save';

const biped = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const tank = { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' };
const deck = (...b: typeof biped[]): Deck => ({ cards: b.map(build => ({ build })) });
const mk = (skills: string[] = [], hero: string | null = null) =>
  new Battle(deck(biped, tank), deck(biped, tank), PARTS, 5, { bots: [false, false], skills: [skills, []], heroes: [hero, null] });
const run = (b: Battle, sec: number) => { for (let i = 0; i < sec * TICK_HZ && !b.over; i++) b.step(); };
const fill = (b: Battle, team: 0 | 1 = 0) => { b.watt[team] = 10; };

describe('스킬 8종', () => {
  it('영웅 3종의 겉모습 조합은 조립 규칙으로도 유효하다', () => {
    for (const h of HEROES) expect(assemble(h.build, PARTS).ok, h.id).toBe(true);
  });

  it('와트가 모자라거나 쿨다운 중이면 못 쓴다', () => {
    const b = mk(['sk_overload']);
    b.watt[0] = 1;
    expect(b.castSkill(0, 0)).toBe(false);
    fill(b);
    expect(b.castSkill(0, 0)).toBe(true);
    fill(b);
    expect(b.castSkill(0, 0)).toBe(false); // 쿨다운 20초
    run(b, 20.5); fill(b);
    expect(b.castSkill(0, 0)).toBe(true);
  });

  it('폭격은 고른 지점 둘레의 적에게만 80 피해를 준다', () => {
    const b = mk(['sk_bomb']); fill(b, 1); b.spawn(1, 0, 4.5, 19); b.spawn(1, 0, 13.5, 19);
    const [a, c] = b.units;
    fill(b);
    expect(b.castSkill(0, 0)).toBe(false);          // 지점 필요
    expect(b.castSkill(0, 0, 13.5, 19)).toBe(true);
    expect(a.hp).toBe(a.maxHp); expect(c.hp).toBe(c.maxHp - 80);
  });

  it('긴급 수리는 내 유닛 체력을 25% 올리고 최대를 넘지 않는다', () => {
    const b = mk(['sk_repair']); fill(b); b.spawn(0, 0, 9, 10); fill(b);
    const u = b.units[0]; u.hp = 50;
    b.castSkill(0, 0);
    expect(u.hp).toBeCloseTo(50 + u.maxHp * 0.25, 5);
  });

  it('기지 포격은 적 기지를 60 깎고, 적 보호막이 있으면 30', () => {
    const b = mk(['sk_strike']); fill(b);
    b.castSkill(0, 0);
    expect(b.baseHp[1]).toBe(BASE_HP - 60);
  });

  it('보호막은 내 기지가 받는 피해를 절반으로 줄인다', () => {
    const mkShield = (shield: boolean) => {
      const b = new Battle(deck(tank), deck(biped), PARTS, 3, { bots: [false, false], towers: false, skills: [shield ? ['sk_shield'] : [], []] });
      return b;
    };
    const hit = (shield: boolean) => {
      const b = mkShield(shield); fill(b);
      if (shield) b.castSkill(0, 0);
      b.watt[1] = 10; b.spawn(1, 0, 9, 20);
      const u = b.units[0]; const bp = basePos(0); u.x = bp.x; u.y = bp.y + 2.5; u.px = u.x; u.py = u.y; // 내 기지 앞
      run(b, 3);
      return BASE_HP - b.baseHp[0];
    };
    const plain = hit(false), shielded = hit(true);
    expect(plain).toBeGreaterThan(0);
    expect(shielded).toBeCloseTo(plain / 2, 1);
  });

  it('감속장은 적 속도를 40% 줄이고 시간이 지나면 풀린다', () => {
    const mv = (slow: boolean) => {
      const b = mk(slow ? ['sk_slow'] : []); fill(b); fill(b, 1);
      if (slow) b.castSkill(0, 0);
      b.spawn(1, 0, 4.5, 20); const u = b.units[0]; const y0 = u.y; run(b, 2);
      return y0 - u.y;
    };
    expect(mv(true)).toBeCloseTo(mv(false) * 0.6, 1);
  });

  it('방어 깎기는 방어 −20 을 6초 준다 (0 미만으로 내려가지 않는다)', () => {
    const b = mk(['sk_armor']); fill(b); fill(b, 1); b.spawn(1, 1, 9, 20); // 탑형 대포: 방어 30
    const e = b.units[0];
    expect(b['armorOf'](e)).toBe(30);
    b.castSkill(0, 0);
    expect(b['armorOf'](e)).toBe(10);
    run(b, 6.2);
    expect(b['armorOf'](e)).toBe(30);
  });

  it('정비 신호는 5초간 와트 충전이 2배', () => {
    const gain = (on: boolean) => {
      const b = mk(on ? ['sk_charge'] : []); b.watt[0] = 4;
      if (on) { b.castSkill(0, 0); b.watt[0] = 4; }
      run(b, 4); return b.watt[0] - 4;
    };
    expect(gain(true)).toBeCloseTo(gain(false) * 2, 1);
  });
});

describe('영웅 3종', () => {
  it('와트 6 으로 출격하고, 죽으면 40초 뒤에야 다시 나갈 수 있다', () => {
    const b = mk([], 'hero_vanguard'); fill(b);
    expect(b.deployHero(0, 9, 10)).toBe(true);
    expect(b.watt[0]).toBeCloseTo(10 - HERO_WATT, 5);
    expect(b.deployHero(0, 9, 10)).toBe(false);          // 이미 출격 중
    const u = b.heroUnit(0)!; u.hp = 0;
    b.step();
    expect(b.heroUnit(0)).toBeNull();
    fill(b); expect(b.deployHero(0, 9, 10)).toBe(false); // 재출격 대기
    run(b, HERO_RESPAWN_SEC + 0.5); fill(b);
    expect(b.deployHero(0, 9, 10)).toBe(true);
  });

  it('출격 자리는 내 진영 어디든, 강·적 진영·포탑 자리는 안 된다', () => {
    const b = mk([], 'hero_vanguard'); fill(b);
    expect(b.deployHero(0, 9, 15.5)).toBe(false); expect(b.deployHero(0, 9, 22)).toBe(false);
    expect(b.deployHero(0, 3, 11)).toBe(true);
    const u = b.heroUnit(0)!; expect(u.x).toBe(3); expect(u.y).toBe(11);
  });

  it('돌격형 돌진은 앞으로 2.4칸 뛰며 지나는 지상 적에게 피해를 준다', () => {
    const b = mk([], 'hero_vanguard'); fill(b); fill(b, 1); b.deployHero(0, 4.5, 12); b.spawn(1, 0, 4.5, 20);
    const h = b.heroUnit(0)!, e = b.units.find(u => u.team === 1)!;
    e.x = 4.5; e.y = 13.5; e.px = e.x; e.py = e.y; e.cd = 999; h.cd = 999;
    const hp0 = e.hp;
    expect(b.castHeroSkill(0)).toBe(true);
    expect(h.y).toBeCloseTo(14.4, 5);
    expect(e.hp).toBeLessThan(hp0);
    expect(b.castHeroSkill(0)).toBe(false);          // 쿨다운
  });

  it('사격형 일제 사격은 가까운 적 4기까지만, 지원형은 가까운 아군 35% 치료', () => {
    const s = mk([], 'hero_sniper'); fill(s); fill(s, 1); s.deployHero(0, 9, 11);
    for (let i = 0; i < 5; i++) { fill(s, 1); s.spawn(1, 0, 2 + i * 3, 20); }
    s.units.filter(u => u.team === 1).forEach((u, i) => { u.y = 12 + i; u.px = u.x; u.py = u.y; u.cd = 999; });
    s.heroUnit(0)!.cd = 999;
    const before = s.units.filter(u => u.team === 1).map(u => u.hp);
    s.castHeroSkill(0);
    const hit = s.units.filter(u => u.team === 1).filter((u, i) => u.hp < before[i]).length;
    expect(hit).toBe(4);

    const m = mk([], 'hero_medic'); fill(m); m.deployHero(0, 9, 11); m.spawn(0, 0, 7, 12);
    const ally = m.units.find(u => !u.hero)!; ally.hp = 10;
    m.castHeroSkill(0);
    expect(ally.hp).toBeCloseTo(10 + ally.maxHp * 0.35, 5);
    expect(m.eff.shield[0]).toBeGreaterThan(0);
  });

  it('영웅은 동시 유닛 상한(12)에 들어가지 않는다', () => {
    const b = mk([], 'hero_vanguard');
    for (let i = 0; i < 12; i++) { fill(b); expect(b.spawn(0, 0, 1.5 + (i % 6) * 3, 11 + Math.floor(i / 6) * 2)).toBe(true); }
    fill(b); expect(b.spawn(0, 0, 9, 13)).toBe(false);
    expect(b.deployHero(0, 9, 13)).toBe(true);
  });
});

describe('봇의 스킬·영웅 사용', () => {
  it('스킬 2개와 영웅을 받은 봇끼리도 끝까지 돌고, 영웅이 출격해 기술을 쓴다', () => {
    for (const hero of HEROES) {
      const b = new Battle(deck(biped, tank), deck(biped, tank), PARTS, 11, { skills: [['sk_bomb', 'sk_overload'], ['sk_repair', 'sk_slow']], heroes: [hero.id, hero.id] });
      let heroSeen = false, skillSeen = false;
      while (b.step()) { for (const e of b.events) { if (e.type === 'spawn' && b.units.find(u => u.id === e.unit)?.hero) heroSeen = true; if (e.type === 'skill') skillSeen = true; } }
      expect(heroSeen, hero.id).toBe(true);
      expect(skillSeen, hero.id).toBe(true);
      expect(b.over).toBe(true);
    }
  });
});

describe('장비 저장', () => {
  it('모르는 값·잠긴 항목·중복은 기본값으로 고친다', () => {
    const d = defaultLoadout();
    expect(repairLoadout(null, 1)).toEqual(d);
    expect(repairLoadout({ skills: ['x', 'sk_slow', 'sk_slow'], hero: 'hero_sniper' }, 1)).toEqual({ skills: ['sk_bomb', 'sk_repair'], hero: 'hero_vanguard' }); // sk_slow·sniper 는 레벨 잠금
    expect(repairLoadout({ skills: ['sk_slow', 'sk_charge'], hero: 'hero_sniper' }, 5)).toEqual({ skills: ['sk_slow', 'sk_charge'], hero: 'hero_sniper' });
    expect(repairLoadout({ skills: ['sk_slow'], hero: 'hero_medic' }, 5)).toEqual({ skills: ['sk_slow', 'sk_bomb'], hero: 'hero_medic' });
  });
  it('옛 세이브(장비 칸 없음)도 읽힌다', () => {
    const ids = PARTS.map(p => p.id);
    const old = JSON.parse(JSON.stringify(defaultSave(ids))); delete old.loadout;
    expect(repairSave(old, ids).loadout).toEqual(defaultLoadout());
  });
  it('스킬 8종은 id 가 겹치지 않고 해금 레벨이 있다', () => {
    expect(new Set(SKILLS.map(s => s.id)).size).toBe(8);
    expect(SKILLS.filter(s => s.unlock === 1).length).toBeGreaterThanOrEqual(2);
  });
});
