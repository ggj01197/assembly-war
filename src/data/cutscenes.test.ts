import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { PARTS } from './parts';
import { SCENES, sceneById, chapterScene, END_SCENE } from './cutscenes';
import { defaultSave, repairSave } from '../domain/save';

describe('컷신 데이터', () => {
  it('4장면·12컷, id 가 장 번호·엔딩과 맞는다', () => {
    expect(SCENES.map(s => s.id)).toEqual(['cs-ch1', 'cs-ch2', 'cs-ch3', 'cs-end']);
    expect(SCENES.flatMap(s => s.cuts).length).toBe(12);
    expect(chapterScene(2)).toBe('cs-ch2'); expect(sceneById(END_SCENE)?.title).toBe('에필로그'); expect(sceneById('nope')).toBeUndefined();
  });
  it('모든 컷의 그림 파일이 있고 크기가 적당하며(≤600KB), 대사가 비어 있지 않다', () => {
    const seen = new Set<string>();
    for (const sc of SCENES) for (const c of sc.cuts) {
      const f = `public/${c.img}`; expect(existsSync(f), f).toBe(true); expect(statSync(f).size, f).toBeLessThan(600 * 1024);
      expect(seen.has(c.img)).toBe(false); seen.add(c.img);
      expect(c.lines.length).toBeGreaterThan(0);
      for (const l of c.lines) { expect(l.text.trim().length).toBeGreaterThan(3); expect(l.text.length).toBeLessThan(80); }
    }
  });
  it('금지어(노바)가 대사에 없다', () => { for (const sc of SCENES) for (const c of sc.cuts) for (const l of c.lines) expect(l.text + l.who).not.toMatch(/노바|NOVA/i); });
  it('본 컷신 기록은 세이브에 남고 망가진 값은 걸러진다', () => {
    const ids = PARTS.map(p => p.id), s = defaultSave(ids);
    expect(s.cuts).toEqual([]);
    expect(repairSave({ ...s, cuts: ['cs-ch1', 'cs-ch1', 'x', 5, 'cs-end'] }, ids).cuts).toEqual(['cs-ch1', 'cs-end']);
    expect(repairSave({}, ids).cuts).toEqual([]);
  });
});
