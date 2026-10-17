import { layoutUnit, spriteUrl } from '../game/unitLayout';
import type { Build } from '../domain/assemble';
import { PARTS } from '../data/parts';

/** 격납고·조립·카드에 쓰는 유닛 그림(HTML). 다리 → 몸통 → 무기 순으로 겹친다 (TD-006). */
export function unitHtml(b: Pick<Build, 'legs' | 'body' | 'weapon'>, scale: number, cls = ''): string {
  const L = layoutUnit(b, scale);
  if (!L) return `<div class="unit missing ${cls}" style="width:${48 * scale}px;height:${48 * scale}px"></div>`;
  const legs = PARTS.find(p => p.id === b.legs);
  const air = legs && legs.kind === 'legs' && legs.move === 'air';
  const imgs = L.parts.map(p => `<img src="${spriteUrl(p.id)}" alt="" draggable="false" style="left:${(p.x - L.minX).toFixed(1)}px;top:${(p.y - L.minY).toFixed(1)}px;width:${p.w.toFixed(1)}px;height:${p.h.toFixed(1)}px">`).join('');
  return `<div class="unit ${air ? 'air' : ''} ${cls}" style="width:${L.w.toFixed(1)}px;height:${L.h.toFixed(1)}px">${imgs}</div>`;
}

/** 정해진 상자(boxW×boxH) 안에 꼭 맞게 줄여 그린다 — 작은 칸(카드·슬롯)용 */
export function unitFit(b: Pick<Build, 'legs' | 'body' | 'weapon'>, boxW: number, boxH: number, cls = ''): string {
  const L = layoutUnit(b, 1);
  if (!L) return unitHtml(b, 0.3, cls);
  return unitHtml(b, Math.min(boxW / L.w, boxH / L.h), cls);
}

export const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function partName(id: string): string { return PARTS.find(p => p.id === id)?.name ?? id; }
export const TARGET_LABEL = { ground: '지상', air: '공중', both: '지상·공중' } as const;
export const SHAPE_LABEL = { arm: '팔형', turret: '탑형', shoulder: '어깨형' } as const;
