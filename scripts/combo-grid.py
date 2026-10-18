# 무작위 조립 가능 조합을 한 장에 합성해 눈으로 점검한다 (R-01: 60종 확장 일관성).
#   python scripts/combo-grid.py <출력.png> [개수=60] [시드=1] [열=10]
import sys, os, json, random
BACK = len(sys.argv) > 5 and sys.argv[5] == 'back'   # 5번째 인자 back → 뒷모습 세트
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
parts = json.load(open(os.path.join(ROOT, 'src/data/parts.json'), encoding='utf-8'))
A = json.load(open(os.path.join(ROOT, 'src/data/parts-anchors-back.json' if BACK else 'src/data/parts-anchors.json'), encoding='utf-8'))
by = {p['id']: p for p in parts}
legs = [p for p in parts if p['kind'] == 'legs']; bodies = [p for p in parts if p['kind'] == 'body']; weps = [p for p in parts if p['kind'] == 'weapon']

def ok(l, b, w):
    if b['shape'] != w['shape']: return False
    if w['family'] != 'repair' and w['target'] != 'ground' and b['shape'] != 'shoulder': return False
    return b['weight'] + w['weight'] <= l['load']

out, N, seed = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 60, int(sys.argv[3]) if len(sys.argv) > 3 else 1
COLS = int(sys.argv[4]) if len(sys.argv) > 4 else 10
rnd = random.Random(seed)
valid = [(l, b, w) for l in legs for b in bodies for w in weps if ok(l, b, w)]
picks = rnd.sample(valid, min(N, len(valid)))
CELL = 200
rows = (len(picks) + COLS - 1) // COLS
sheet = Image.new('RGBA', (CELL * COLS, CELL * rows), (24, 34, 52, 255))
def load(pid):
    im = Image.open(os.path.join(ROOT, 'public/sprites/parts_back' if BACK else 'public/sprites/parts', pid + '.png')).convert('RGBA'); s = A[pid]['scale'] * 0.8
    return im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
def put(c, im, x, y, ax, ay): c.alpha_composite(im, (int(x - im.width * ax), int(y - im.height * ay)))
for i, (l, b, w) in enumerate(picks):
    cx, cy = (i % COLS) * CELL + CELL // 2, (i // COLS) * CELL + CELL - 14
    li, bi, wi = load(l['id']), load(b['id']), load(w['id']); la, ba, wa = A[l['id']], A[b['id']], A[w['id']]
    put(sheet, li, cx, cy, *la['foot'])
    hip = (cx - li.width * la['foot'][0] + li.width * la['hip'][0], cy - li.height * la['foot'][1] + li.height * la['hip'][1])
    put(sheet, bi, hip[0], hip[1], *ba['bottom'])
    mount = (hip[0] - bi.width * ba['bottom'][0] + bi.width * ba['mount'][0], hip[1] - bi.height * ba['bottom'][1] + bi.height * ba['mount'][1])
    put(sheet, wi, mount[0], mount[1], *wa['grip'])
sheet.save(out); print('saved', out, len(picks), 'of', len(valid), 'valid combos')
