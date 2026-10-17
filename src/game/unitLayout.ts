import anchors from '../data/parts-anchors.json';
import { PARTS } from '../data/parts';
import type { Build } from '../domain/assemble';

/**
 * 모듈 파츠 겹치기 (TD-006): 다리 → 몸통 → 무기 순으로 앵커 점에 맞춰 쌓는다.
 * 격납고·조립 화면(HTML)과 전장(Phaser)이 같은 배치를 쓴다. 좌표는 "발 바닥 가운데 = (0,0), 위쪽이 −y".
 */
export interface Anchor { scale?: number; foot?: [number, number]; hip?: [number, number]; bottom?: [number, number]; mount?: [number, number]; grip?: [number, number] }
export interface Placed { id: string; x: number; y: number; w: number; h: number }
export interface UnitLayout { parts: Placed[]; minX: number; minY: number; maxX: number; maxY: number; w: number; h: number }

const A = anchors as unknown as Record<string, Anchor>;

/** 스프라이트 원본 크기 (로드 뒤 채워진다) */
export const spriteSize: Record<string, { w: number; h: number }> = {};

export function spriteUrl(id: string): string { return `sprites/parts/${id}.png`; }

export function loadSprites(): Promise<void> {
  const ids = PARTS.filter(p => p.kind !== 'accessory').map(p => p.id);
  return Promise.all(ids.map(id => new Promise<void>(res => {
    const im = new Image();
    im.onload = () => { spriteSize[id] = { w: im.naturalWidth, h: im.naturalHeight }; res(); };
    im.onerror = () => { spriteSize[id] = { w: 200, h: 200 }; res(); };
    im.src = spriteUrl(id);
  }))).then(() => undefined);
}

export function hasSprite(id: string): boolean { return !!spriteSize[id]; }

/** scale: 공통 배율 (전장 ≈ 0.42, 조립 화면 ≈ 1.1) */
export function layoutUnit(b: Pick<Build, 'legs' | 'body' | 'weapon'>, scale = 1): UnitLayout | null {
  const sz = (id: string) => {
    const s = spriteSize[id]; const a = A[id];
    if (!s || !a) return null;
    const k = (a.scale ?? 1) * scale;
    return { w: s.w * k, h: s.h * k };
  };
  const ls = sz(b.legs), bs = sz(b.body), ws = sz(b.weapon);
  const la = A[b.legs], ba = A[b.body], wa = A[b.weapon];
  if (!ls || !bs || !ws || !la?.foot || !la.hip || !ba?.bottom || !ba.mount || !wa?.grip) return null;
  const lx = -ls.w * la.foot[0], ly = -ls.h * la.foot[1];
  const hip = { x: lx + ls.w * la.hip[0], y: ly + ls.h * la.hip[1] };
  const bx = hip.x - bs.w * ba.bottom[0], by = hip.y - bs.h * ba.bottom[1];
  const mount = { x: bx + bs.w * ba.mount[0], y: by + bs.h * ba.mount[1] };
  const wx = mount.x - ws.w * wa.grip[0], wy = mount.y - ws.h * wa.grip[1];
  const parts: Placed[] = [
    { id: b.legs, x: lx, y: ly, w: ls.w, h: ls.h },
    { id: b.body, x: bx, y: by, w: bs.w, h: bs.h },
    { id: b.weapon, x: wx, y: wy, w: ws.w, h: ws.h },
  ];
  const minX = Math.min(...parts.map(p => p.x)), minY = Math.min(...parts.map(p => p.y));
  const maxX = Math.max(...parts.map(p => p.x + p.w)), maxY = Math.max(...parts.map(p => p.y + p.h));
  return { parts, minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
