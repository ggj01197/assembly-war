import { z } from 'zod';
import raw from './parts.json';

/** 부품 형태: 몸통과 무기가 같아야 장착된다 (기획안 §4-2 규칙 2). 어깨형만 대공 무기를 받는다. */
export const Shape = z.enum(['arm', 'turret', 'shoulder']);
export const Target = z.enum(['ground', 'air', 'both']);
export const Move = z.enum(['ground', 'air']);

const Base = { id: z.string().min(1), name: z.string().min(1), weight: z.number().int().min(0), watt: z.number().min(0) };

export const LegsPart = z.object({ ...Base, kind: z.literal('legs'), load: z.number().int().min(1), speed: z.number().min(1).max(5), hp: z.number().int().min(0), move: Move });
export const BodyPart = z.object({ ...Base, kind: z.literal('body'), shape: Shape, hp: z.number().int().min(1), armor: z.number().int().min(0).max(60), sight: z.number().min(1) });
export const WeaponPart = z.object({ ...Base, kind: z.literal('weapon'), shape: Shape, dmg: z.number().min(1), range: z.number().min(1).max(9), rate: z.number().min(0.2), target: Target, family: z.string() });
export const AccessoryPart = z.object({ ...Base, kind: z.literal('accessory'), effect: z.object({
  wattDiscount: z.number().min(0).optional(), hpPct: z.number().optional(), armor: z.number().optional(), speedPct: z.number().optional(), addAir: z.boolean().optional(), sight: z.number().optional(),
}) });

export const Part = z.discriminatedUnion('kind', [LegsPart, BodyPart, WeaponPart, AccessoryPart]);
export type Part = z.infer<typeof Part>;
export type Legs = z.infer<typeof LegsPart>;
export type Body = z.infer<typeof BodyPart>;
export type Weapon = z.infer<typeof WeaponPart>;
export type Accessory = z.infer<typeof AccessoryPart>;

export const PARTS: Part[] = z.array(Part).parse(raw);
