import { z } from 'zod';
import raw from './parts.json';

/** 부품 형태: 몸통과 무기가 같아야 장착된다 (기획안 §4-2 규칙 2). 어깨형만 대공 무기를 받는다. */
export const Shape = z.enum(['arm', 'turret', 'shoulder']);
export const Target = z.enum(['ground', 'air', 'both']);
export const Move = z.enum(['ground', 'air']);

const Base = { id: z.string().min(1), name: z.string().min(1), weight: z.number().int().min(0), watt: z.number().min(0) };

export const LegsPart = z.object({ ...Base, kind: z.literal('legs'), load: z.number().int().min(1), speed: z.number().min(1).max(5), hp: z.number().int().min(0), move: Move });
export const BodyPart = z.object({ ...Base, kind: z.literal('body'), shape: Shape, hp: z.number().int().min(1), armor: z.number().int().min(0).max(60), sight: z.number().min(1) });
export const Family = z.enum(['gatling', 'cannon', 'missile', 'laser', 'blade', 'flak', 'repair', 'mortar']);
/**
 * 무기 8계열 (기획안 §4-1). 효과는 숫자 필드로만 표현해 sim 이 계열 이름을 몰라도 되게 한다 (repair 만 예외: 피해 대신 치료).
 *  splash 광역 반경(칸) · pierce 방어 무시 비율(0~1) · minRange 최소 사거리(부품 사거리 단위, 이보다 가까운 적은 못 때림)
 */
export const WeaponPart = z.object({ ...Base, kind: z.literal('weapon'), shape: Shape, dmg: z.number().min(1), range: z.number().min(0.5).max(12), rate: z.number().min(0.2), target: Target, family: Family, splash: z.number().min(0).max(12).optional(), pierce: z.number().min(0).max(1).optional(), minRange: z.number().min(0).max(8).optional() });
export const AccessoryPart = z.object({ ...Base, kind: z.literal('accessory'), effect: z.object({
  wattDiscount: z.number().min(0).optional(), hpPct: z.number().optional(), armor: z.number().optional(), speedPct: z.number().optional(), addAir: z.boolean().optional(), sight: z.number().optional(), dmgPct: z.number().optional(), ratePct: z.number().optional(), rangeAdd: z.number().optional(),
}) });

export const Part = z.discriminatedUnion('kind', [LegsPart, BodyPart, WeaponPart, AccessoryPart]);
export type Part = z.infer<typeof Part>;
export type Legs = z.infer<typeof LegsPart>;
export type Body = z.infer<typeof BodyPart>;
export type Weapon = z.infer<typeof WeaponPart>;
export type Accessory = z.infer<typeof AccessoryPart>;

export const PARTS: Part[] = z.array(Part).parse(raw);
