import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { PARTS } from './parts';
import { STAGES, SURVIVAL } from './stages';
import { STORY, STORY_ORDER, STORY_TOTAL, storyOf } from './story';
import { defaultSave, repairSave } from '../domain/save';
import { ACHIEVEMENTS, achDone, achClaimable } from '../domain/goals';

describe('스토리', () => {
  it('본 작전 21개 + 5분 버티기 = 22개 이야기, 모두 실제 작전 id', () => {
    expect(STORY_TOTAL).toBe(22);
    const ids = new Set([...STAGES.map(s => s.id), SURVIVAL.id]);
    for (const id of Object.keys(STORY)) expect(ids.has(id), id).toBe(true);
    for (const s of STAGES) expect(storyOf(s.id), s.id).toBeTruthy();
    expect(STORY_ORDER.flatMap(g => g.ids).sort()).toEqual(Object.keys(STORY).sort());
  });
  it('모든 이야기의 그림 파일이 있고 대사가 짧고 금지어가 없다', () => {
    for (const [id, b] of Object.entries(STORY)) {
      expect(existsSync(`public/${b.img}`), `${id} ${b.img}`).toBe(true);
      expect(b.title.length).toBeGreaterThan(2); expect(b.brief.length).toBeGreaterThan(3);
      expect(b.lines.length).toBeGreaterThanOrEqual(2);
      for (const l of b.lines) { expect(l.text.length).toBeGreaterThan(8); expect(l.text.length).toBeLessThan(90); expect(l.text + l.who + b.title + b.brief).not.toMatch(/노바|NOVA/i); }
    }
  });
  it('보스 작전과 장 마무리는 해당 보스·영웅 초상화를 쓴다', () => {
    expect(STORY['c3-7'].img).toContain('boss_general'); expect(STORY['c2-6'].img).toContain('hero_sniper'); expect(STORY['c3-3'].img).toContain('hero_vanguard');
  });
  it('해금 기록은 세이브에 남고 망가진 값은 걸러진다', () => {
    const ids = PARTS.map(p => p.id), s = defaultSave(ids);
    expect(s.story).toEqual([]);
    expect(repairSave({ ...s, story: ['c1-1', 'c1-1', 'zzz', 3, 'survival'] }, ids).story).toEqual(['c1-1', 'survival']);
    expect(repairSave({}, ids).story).toEqual([]);
  });
  it('이야기 업적: 7·15·22개', () => {
    const s = defaultSave(PARTS.map(p => p.id));
    s.story = Object.keys(STORY).slice(0, 7);
    const done = ACHIEVEMENTS.filter(a => a.id.startsWith('ac_story') && achDone(s, a)).map(a => a.id);
    expect(done).toEqual(['ac_story7']); expect(achClaimable(s)).toBeGreaterThanOrEqual(1);
    s.story = Object.keys(STORY); expect(ACHIEVEMENTS.filter(a => a.id.startsWith('ac_story') && achDone(s, a)).length).toBe(3);
  });
});
