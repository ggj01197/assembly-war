import anchors from '../data/parts-anchors.json';
import anchorsBack from '../data/parts-anchors-back.json';
import { PARTS } from '../data/parts';
import type { Build } from '../domain/assemble';

/**
 * 모듈 파츠 겹치기 (TD-006): 다리 → 몸통 → 무기 순으로 앵커 점에 맞춰 쌓는다.
 * 격납고·조립 화면(HTML)과 전장(Phaser)이 같은 배치를 쓴다. 좌표는 "발 바닥 가운데 = (0,0), 위쪽이 −y".
 */
export interface Anchor { scale?: number; foot?: [number, number]; hip?: [number, number]; bottom?: [number, number]; mount?: [number, number]; grip?: [number, number] }
export interface Placed { id: string; /** 텍스처 키 (뒷모습은 'b_' 접두) */ tex: string; x: number; y: number; w: number; h: number }
export interface UnitLayout { parts: Placed[]; /** 무기를 다는 점(몸통 어깨/팔 자리) — 무기를 이 점을 축으로 돌린다 */ mount: { x: number; y: number }; /** 엉덩이 점(다리 위) — 몸통을 이 점을 축으로 기울인다 */ hip: { x: number; y: number }; minX: number; minY: number; maxX: number; maxY: number; w: number; h: number }

const A = anchors as unknown as Record<string, Anchor>;
const AB = anchorsBack as unknown as Record<string, Anchor>;

/** 스프라이트 원본 크기 (로드 뒤 채워진다) */
export const spriteSize: Record<string, { w: number; h: number }> = {};
/** 뒷모습 세트(내 유닛이 적을 향해 걸어가는 전장용) 크기 */
export const spriteSizeBack: Record<string, { w: number; h: number }> = {};

export function spriteUrl(id: string): string { return `sprites/parts/${id}.png`; }
export function spriteUrlBack(id: string): string { return `sprites/parts_back/${id}.png`; }
export function accIconUrl(id: string): string { return `sprites/acc/${id}.png`; }

export function loadSprites(): Promise<void> {
  const ids = PARTS.filter(p => p.kind !== 'accessory').map(p => p.id);
  const one = (url: string, into: Record<string, { w: number; h: number }>, id: string, fallback: boolean) => new Promise<void>(res => {
    const im = new Image();
    im.onload = () => { into[id] = { w: im.naturalWidth, h: im.naturalHeight }; res(); };
    im.onerror = () => { if (fallback) into[id] = { w: 200, h: 200 }; res(); };
    im.src = url;
  });
  return Promise.all([
    ...ids.map(id => one(spriteUrl(id), spriteSize, id, true)),
    ...ids.map(id => one(spriteUrlBack(id), spriteSizeBack, id, false)),
  ]).then(() => undefined);
}

export function hasSprite(id: string): boolean { return !!spriteSize[id]; }

/** scale: 공통 배율 (전장 ≈ 0.42, 조립 화면 ≈ 1.1) */
export function hasBack(b: Pick<Build, 'legs' | 'body' | 'weapon'>): boolean {
  return [b.legs, b.body, b.weapon].every(id => !!spriteSizeBack[id] && !!AB[id]);
}

/** back=true 면 뒷모습 세트(없으면 앞모습으로 대신한다). 좌표계는 같다. */
export function layoutUnit(b: Pick<Build, 'legs' | 'body' | 'weapon'>, scale = 1, back = false): UnitLayout | null {
  const useBack = back && hasBack(b);
  const SZ = useBack ? spriteSizeBack : spriteSize, AN = useBack ? AB : A;
  const tex = (id: string) => (useBack ? 'b_' + id : id);
  const sz = (id: string) => {
    const s = SZ[id]; const a = AN[id];
    if (!s || !a) return null;
    const k = (a.scale ?? 1) * scale;
    return { w: s.w * k, h: s.h * k };
  };
  const ls = sz(b.legs), bs = sz(b.body), ws = sz(b.weapon);
  const la = AN[b.legs], ba = AN[b.body], wa = AN[b.weapon];
  if (!ls || !bs || !ws || !la?.foot || !la.hip || !ba?.bottom || !ba.mount || !wa?.grip) return null;
  const lx = -ls.w * la.foot[0], ly = -ls.h * la.foot[1];
  const hip = { x: lx + ls.w * la.hip[0], y: ly + ls.h * la.hip[1] };
  const bx = hip.x - bs.w * ba.bottom[0], by = hip.y - bs.h * ba.bottom[1];
  const mount = { x: bx + bs.w * ba.mount[0], y: by + bs.h * ba.mount[1] };
  const wx = mount.x - ws.w * wa.grip[0], wy = mount.y - ws.h * wa.grip[1];
  const parts: Placed[] = [
    { id: b.legs, tex: tex(b.legs), x: lx, y: ly, w: ls.w, h: ls.h },
    { id: b.body, tex: tex(b.body), x: bx, y: by, w: bs.w, h: bs.h },
    { id: b.weapon, tex: tex(b.weapon), x: wx, y: wy, w: ws.w, h: ws.h },
  ];
  const minX = Math.min(...parts.map(p => p.x)), minY = Math.min(...parts.map(p => p.y));
  const maxX = Math.max(...parts.map(p => p.x + p.w)), maxY = Math.max(...parts.map(p => p.y + p.h));
  return { parts, mount, hip, minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
