# 파츠 앵커(접점) 자동 계산 → src/data/parts-anchors.json  (TD-006 의 "정해진 접점" 규칙을 그림에서 읽는다)
#   python scripts/make-anchors.py            (public/sprites/parts/*.png 와 src/data/parts.json 이 있어야 함)
# 규칙(프롬프트에서 모든 시트에 같은 규약을 요구했다):
#   다리  : foot = 가운데 x · 0.96 / hip = 맨 위 장착판 무게중심 x · 0.12
#   몸통  : bottom = 가운데 x · 0.90 / mount = 형태별 고정 (팔형 오른쪽 소켓, 탑형 위 고리, 어깨형 위 받침)
#   무기  : 팔형·어깨형 = 오른쪽 브래킷 무게중심 / 탑형 = 아래 둥근 받침 무게중심
# 수작업으로 고친 값은 scripts/anchor-overrides.json 에 적으면 이 계산을 덮어쓴다.
import json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTS = json.load(open(os.path.join(ROOT, 'src', 'data', 'parts.json'), encoding='utf-8'))
OVR_P = os.path.join(ROOT, 'scripts', 'anchor-overrides.json')
OVR = json.load(open(OVR_P, encoding='utf-8')) if os.path.exists(OVR_P) else {}
SCALE = 0.3

def alpha(pid):
    im = Image.open(os.path.join(ROOT, 'public', 'sprites', 'parts', pid + '.png')).convert('RGBA')
    return im.split()[3], im.size

def cx_of_rows(a, size, y0f, y1f):
    w, h = size; px = a.load(); xs = []
    for y in range(int(h * y0f), max(int(h * y1f), int(h * y0f) + 1)):
        for x in range(w):
            if px[x, y] > 128: xs.append(x)
    return (sum(xs) / len(xs) / w) if xs else 0.5

def cx_cy_of_cols(a, size, x0f, x1f):
    w, h = size; px = a.load(); xs = []; ys = []
    for x in range(int(w * x0f), int(w * x1f)):
        for y in range(h):
            if px[x, y] > 128: xs.append(x); ys.append(y)
    return ((sum(xs) / len(xs) / w), (sum(ys) / len(ys) / h)) if xs else (0.85, 0.4)

out = {'_comment': '앵커는 그림 폭·높이에 대한 비율(0~1). 자동 생성 — scripts/make-anchors.py (수정은 scripts/anchor-overrides.json). legs: foot=바닥 가운데, hip=위 장착판 가운데. body: bottom=아랫면 가운데, mount=무기 장착점. weapon: grip=몸통에 닿는 점. scale 은 공통 축척.'}
MOUNT = {'arm': [0.9, 0.4], 'turret': [0.5, 0.12], 'shoulder': [0.78, 0.1]}
for p in PARTS:
    if p['kind'] == 'accessory': continue
    pid = p['id']; a, size = alpha(pid)
    r = round
    if p['kind'] == 'legs':
        e = {'scale': SCALE, 'foot': [0.5, 0.96], 'hip': [r(cx_of_rows(a, size, 0.0, 0.1), 3), 0.12]}
    elif p['kind'] == 'body':
        e = {'scale': SCALE, 'bottom': [0.5, 0.9], 'mount': MOUNT[p['shape']]}
    else:
        if p['shape'] == 'turret':
            e = {'scale': SCALE, 'grip': [r(cx_of_rows(a, size, 0.93, 1.0), 3), 0.92]}
        else:
            gx, gy = cx_cy_of_cols(a, size, 0.85, 1.0)
            e = {'scale': SCALE, 'grip': [r(gx, 3), r(gy, 3)]}
    e.update(OVR.get(pid, {}))
    out[pid] = e
json.dump(out, open(os.path.join(ROOT, 'src', 'data', 'parts-anchors.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('anchors', len(out) - 1)
