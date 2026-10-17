# 27조합 합성 시험 (2단계 완료 기준, TD-006 / RISK R-01).
# 다리 3 × 몸통 3 × 무기 3 을 앵커로 겹쳐 한 장(9열×3행)으로 저장한다. 눈으로 어색한 조합을 센다.
# 사용: python scripts/combo-check.py <파츠폴더> <출력.png>
import sys, os, json
from PIL import Image

parts_dir, out = sys.argv[1], sys.argv[2]
anchors = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'parts-anchors.json'), encoding='utf-8'))

LEGS = ['legs_biped_light', 'legs_track_heavy', 'legs_hover']
BODIES = ['body_arm_scout', 'body_turret_bunker', 'body_shoulder_guard']
WEAPONS = ['wpn_arm_gatling', 'wpn_turret_cannon', 'wpn_shoulder_missile']
CELL = 220
UNIT_H = 150  # 유닛 전체 높이 목표(픽셀) — 전장 축척의 기준

def load(pid):
    im = Image.open(os.path.join(parts_dir, pid + '.png')).convert('RGBA')
    s = anchors[pid].get('scale', 1.0)
    if s != 1.0: im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    return im

def place(canvas, im, x, y, ax, ay):
    # (x,y) 에 그림의 앵커점(ax,ay: 0~1 비율)을 맞춘다
    canvas.alpha_composite(im, (int(x - im.width * ax), int(y - im.height * ay)))

sheet = Image.new('RGBA', (CELL * 9, CELL * 3), (24, 34, 52, 255))
i = 0
for l in LEGS:
    for b in BODIES:
        for w in WEAPONS:
            col, row = i % 9, i // 9
            cx, cy = col * CELL + CELL // 2, row * CELL + CELL - 20
            legs, body, wpn = load(l), load(b), load(w)
            # 다리: 바닥점(아래 가운데)을 cy 에. 몸통: 다리의 hip 점에 몸통의 bottom 점을. 무기: 몸통의 mount 점에 무기의 grip 점을.
            la, ba, wa = anchors[l], anchors[b], anchors[w]
            place(sheet, legs, cx, cy, la['foot'][0], la['foot'][1])
            hip = (cx - legs.width * la['foot'][0] + legs.width * la['hip'][0], cy - legs.height * la['foot'][1] + legs.height * la['hip'][1])
            place(sheet, body, hip[0], hip[1], ba['bottom'][0], ba['bottom'][1])
            mount = (hip[0] - body.width * ba['bottom'][0] + body.width * ba['mount'][0], hip[1] - body.height * ba['bottom'][1] + body.height * ba['mount'][1])
            place(sheet, wpn, mount[0], mount[1], wa['grip'][0], wa['grip'][1])
            i += 1
sheet.save(out)
print('saved', out, i, 'combos')
