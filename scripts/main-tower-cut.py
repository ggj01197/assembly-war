# 메인 타워(기지) 시트(2x2, 흰 바탕)를 4상태 PNG 로 자른다: 멀쩡·손상·파괴·발사
#   원본: 00_PROJECT_CONTROL/art-src/main-tower/main_<f|b>.png  →  public/sprites/tower/main_<f|b>_<ok|hurt|dead|fire>.png
#   네 장 모두 같은 크기 칸에, 같은 배율(멀쩡 상태 너비 기준)·같은 바닥선(칸 아래 88%)으로 둔다 → 게임이 이미지만 바꿔 끼우면 된다.
import os, sys, importlib.util
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(os.path.join(ROOT, '..', '00_PROJECT_CONTROL', 'art-src', 'main-tower'))
OUT = os.path.join(ROOT, 'public', 'sprites', 'tower')
spec = importlib.util.spec_from_file_location('mc', os.path.join(ROOT, 'scripts', 'motion-cut.py'))
mc = importlib.util.module_from_spec(spec); spec.loader.exec_module(mc)
NAMES = ['ok', 'hurt', 'dead', 'fire']
TARGET_W = 420      # 멀쩡한 상태의 가로 크기(px)

for side in ('f', 'b'):
    src = os.path.join(SRC, f'main_{side}.png')
    if not os.path.exists(src): print('없음', src); continue
    sheet = Image.open(src).convert('RGB'); SW, SH = sheet.size; cw, ch = SW // 2, SH // 2
    def clean(c):
        # 본체와 떨어진 작은 조각(옆 칸 불꽃 등) 지우기 + 칸 가장자리에서 잘린 불꽃·연기는 부드럽게 사라지게
        a = np.asarray(c).copy(); al = a[..., 3]
        n, lab, st, _ = cv2.connectedComponentsWithStats((al > 40).astype(np.uint8), connectivity=8)
        if n > 2:
            big = st[1:, cv2.CC_STAT_AREA].max()
            for i in range(1, n):
                if st[i, cv2.CC_STAT_AREA] < big * 0.04: al[lab == i] = 0
        h, w = al.shape; R = 22
        ramp = np.ones((h, w), np.float32)
        for d in range(R):
            f = d / R
            ramp[d, :] = np.minimum(ramp[d, :], f); ramp[h - 1 - d, :] = np.minimum(ramp[h - 1 - d, :], f)
            ramp[:, d] = np.minimum(ramp[:, d], f); ramp[:, w - 1 - d] = np.minimum(ramp[:, w - 1 - d], f)
        a[..., 3] = (al * ramp).astype(np.uint8)
        return Image.fromarray(a, 'RGBA')
    cells, bbs = [], []
    for i in range(4):
        c = clean(mc.remove_white(sheet.crop(((i % 2) * cw + 6, (i // 2) * ch + 6, (i % 2 + 1) * cw - 6, (i // 2 + 1) * ch - 6))))
        bb = mc.bbox_of(c); cells.append(c); bbs.append(bb)
    k = TARGET_W / (bbs[0][2] - bbs[0][0])
    frames = []
    for c, bb in zip(cells, bbs):
        fr = c.crop(bb); frames.append(fr.resize((max(1, round(fr.width * k)), max(1, round(fr.height * k))), Image.LANCZOS))
    W = max(f.width for f in frames) + 40
    above = max(f.height for f in frames) + 20            # 바닥선 위쪽 높이
    H = round(above / 0.88)
    base = round(H * 0.88)
    for name, fr in zip(NAMES, frames):
        tile = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        tile.paste(fr, ((W - fr.width) // 2, base - fr.height), fr)
        tile.save(os.path.join(OUT, f'main_{side}_{name}.png'), optimize=True)
    print('cut', side, W, H)
