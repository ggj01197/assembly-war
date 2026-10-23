# Codex 가 만든 부품 동작 시트(2x2, 흰 바탕)를 게임용 4프레임 가로 시트로 자른다.
#   원본: 00_PROJECT_CONTROL/art-src/motion/{legs,weapons}/<부품id>_<front|back>.png
#   결과: public/sprites/anim/<부품id>_<front|back>.png  (원본 그림과 같은 칸 크기 × 4칸, 가로로 이어 붙임) + src/data/anim-frames.json
#   python scripts/motion-cut.py [부품id ...]     (없으면 있는 것 전부)
# 맞추는 법(앵커가 그대로 쓰이도록 원본 그림과 같은 칸 크기·같은 기준점에 둔다):
#   다리(걷기·궤도·바퀴): 위 장착판 가운데 x, 바닥 y 를 원본에 맞춤 / 호버·비행: 장착판 가운데 x, 위쪽 y 를 맞춤 / 무기: 1번 칸 기준으로 모든 칸 같은 배율·같은 위치(칸 안에서의 움직임 보존)
import os, sys, json
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(os.path.join(ROOT, '..', '00_PROJECT_CONTROL', 'art-src', 'motion'))
SPR = os.path.join(ROOT, 'public', 'sprites')
OUT = os.path.join(SPR, 'anim')
HOVER_FLY = ('legs_hover', 'legs_hover_heavy', 'legs_flyer')


def remove_white(cell):
    """가장자리와 이어진 흰 바탕을 투명으로 (안쪽 흰 부품은 남긴다). 가장자리는 한 겹 깎아 흰 테두리를 없앤다."""
    rgb = cell.convert('RGB')
    w, h = rgb.size
    tmp = rgb.copy()
    for pt in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if tmp.getpixel(pt)[0] > 200:
            ImageDraw.floodfill(tmp, pt, (255, 0, 255), thresh=34)
    a = np.asarray(tmp).astype(int)
    bg = (a[..., 0] > 240) & (a[..., 1] < 20) & (a[..., 2] > 240)
    m8 = ((~bg) * 255).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats((m8 > 0).astype(np.uint8), connectivity=8)
    if n > 2:                                    # 옆 칸에서 넘어온 잔점·작은 얼룩 지우기 (가장 큰 덩어리의 0.8% 미만)
        big = st[1:, cv2.CC_STAT_AREA].max()
        for i in range(1, n):
            if st[i, cv2.CC_STAT_AREA] < big * 0.008: m8[lab == i] = 0
    mask = Image.fromarray(m8)
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out = rgb.convert('RGBA'); out.putalpha(mask)
    return out


def bbox_of(im, thr=40):
    a = np.asarray(im.split()[3]) > thr
    ys, xs = np.nonzero(a)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else None


def plate_cx(im, bb):
    """위쪽 12% 줄의 가운데 x (장착판 가운데)"""
    a = np.asarray(im.split()[3]) > 40
    y0, y1 = bb[1], bb[1] + max(2, int((bb[3] - bb[1]) * 0.12))
    xs = np.nonzero(a[y0:y1])[1]
    return float(xs.mean()) if len(xs) else (bb[0] + bb[2]) / 2


def cut(kind, pid, side):
    src = os.path.join(SRC, kind, f'{pid}_{side}.png')
    orig_path = os.path.join(SPR, 'parts' if side == 'front' else 'parts_back', pid + '.png')
    if not (os.path.exists(src) and os.path.exists(orig_path)): return False
    orig = Image.open(orig_path).convert('RGBA'); W, H = orig.size
    ob = bbox_of(orig); ocx = plate_cx(orig, ob)
    sheet = Image.open(src).convert('RGB'); SW, SH = sheet.size; cw, ch = SW // 2, SH // 2
    PAD = 6
    cells = []
    for i in range(4):
        c = sheet.crop(((i % 2) * cw + PAD, (i // 2) * ch + PAD, (i % 2 + 1) * cw - PAD, (i // 2 + 1) * ch - PAD))
        cells.append(remove_white(c))
    bbs = [bbox_of(c) for c in cells]
    if any(b is None for b in bbs): print('빈 칸', pid, side); return False
    mx, mt, mb = round(W * 0.28), round(H * 0.10), round(H * 0.05)      # 걸음에 벌어진 다리·불꽃이 잘리지 않게 칸에 여백을 둔다 (원본 그림은 (mx, mt) 에 놓임)
    TW, TH = W + 2 * mx, H + mt + mb
    out = Image.new('RGBA', (TW * 4, TH), (0, 0, 0, 0))
    if kind == 'legs':
        walk = pid not in HOVER_FLY and not any(k in pid for k in ('track', 'wheel'))
        for i, (c, bb) in enumerate(zip(cells, bbs)):
            # 배율: 걷는 다리는 높이(바닥~장착판), 나머지는 너비
            k = (ob[3] - ob[1]) / (bb[3] - bb[1]) if walk else (ob[2] - ob[0]) / (bb[2] - bb[0])
            if i == 0: k0 = k
            k = (k + k0) / 2 if i else k          # 칸마다 배율이 튀지 않게
            fr = c.crop(bb); fr = fr.resize((max(1, round(fr.width * k)), max(1, round(fr.height * k))), Image.LANCZOS)
            cx = (plate_cx(c, bb) - bb[0]) * k
            x = round(ocx - cx) + mx
            y = (round(ob[1]) if pid in HOVER_FLY else round(ob[3] - fr.height)) + mt
            tile = Image.new('RGBA', (TW, TH), (0, 0, 0, 0)); tile.paste(fr, (x, y), fr)
            out.alpha_composite(tile, (i * TW, 0))
    else:
        b0 = bbs[0]; k = (ob[2] - ob[0]) / (b0[2] - b0[0])
        # 1번 칸의 그림 중심이 원본 그림 중심에 오도록, 나머지 칸은 같은 변환(칸 안의 움직임 보존)
        ccx0, ccy0 = (b0[0] + b0[2]) / 2, (b0[1] + b0[3]) / 2
        ocx2, ocy2 = (ob[0] + ob[2]) / 2, (ob[1] + ob[3]) / 2
        for i, c in enumerate(cells):
            sc = c.resize((round(c.width * k), round(c.height * k)), Image.LANCZOS)
            ox, oy = round(ocx2 - ccx0 * k) + mx, round(ocy2 - ccy0 * k) + mt
            tile = Image.new('RGBA', (TW, TH), (0, 0, 0, 0)); tile.paste(sc, (ox, oy), sc)
            out.alpha_composite(tile, (i * TW, 0))
    os.makedirs(OUT, exist_ok=True)
    out.save(os.path.join(OUT, f'{pid}_{side}.png'), optimize=True)
    return (mx, mt, mb)


if __name__ == '__main__':
    only = set(sys.argv[1:])
    done = {}; margins = {}
    for kind in ('legs', 'weapons'):
        d = os.path.join(SRC, kind)
        if not os.path.isdir(d): continue
        for f in sorted(os.listdir(d)):
            if not f.endswith('.png'): continue
            pid, side = f[:-4].rsplit('_', 1)
            if only and pid not in only: continue
            m = cut(kind, pid, side)
            if m: done.setdefault(pid, []).append(side); margins[pid] = list(m); print('[cut]', pid, side)
    # 지금 public/sprites/anim 에 있는 것 전부를 목록으로
    allf = {}
    for f in sorted(os.listdir(OUT)) if os.path.isdir(OUT) else []:
        if f.endswith('.png'):
            pid, side = f[:-4].rsplit('_', 1)
            im = Image.open(os.path.join(SPR, 'parts', pid + '.png')); W, H = im.size
            allf.setdefault(pid, {'m': [round(W * 0.28), round(H * 0.10), round(H * 0.05)], 'sides': []})['sides'].append(side)
    json.dump(allf, open(os.path.join(ROOT, 'src', 'data', 'anim-frames.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('manifest', len(allf), 'parts')
