# 검은 배경 FX·투사체 시트를 칸별 투명 PNG 로 자른다 (Higgsfield 시트, gpt_image_2_5).
#   python scripts/cut-fx.py <시트.png> <출력폴더> <id1,id2,...> <열> <행> <glow|solid>
#   glow  : 불빛 계열 — 알파 = 가장 밝은 채널(색은 되돌려 놓음). 일반·ADD 블렌드 둘 다 자연스럽다.
#   solid : 몸통이 있는 투사체 — 어두운 회색도 불투명하게 남기는 문턱 알파
import sys, os
from PIL import Image
src, out, ids, COLS, ROWS, mode = sys.argv[1], sys.argv[2], sys.argv[3].split(','), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert('RGB'); W, H = im.size; cw, ch = W // COLS, H // ROWS; PAD = 8
for i, pid in enumerate(ids):
    if pid == '-': continue
    cx, cy = (i % COLS) * cw, (i // COLS) * ch
    cell = im.crop((cx + PAD, cy + PAD, cx + cw - PAD, cy + ch - PAD)); px = cell.load(); w, h = cell.size
    rgba = Image.new('RGBA', (w, h)); d = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]; m = max(r, g, b)
            if mode == 'glow':
                a = m
                d[x, y] = (min(255, r * 255 // m), min(255, g * 255 // m), min(255, b * 255 // m), a) if m > 4 else (0, 0, 0, 0)
            else:
                a = max(0, min(255, (m - 14) * 255 // 40))
                d[x, y] = (r, g, b, a) if a > 0 else (0, 0, 0, 0)
    bb = rgba.getbbox()
    if bb: rgba = rgba.crop(bb)
    rgba.save(os.path.join(out, pid + '.png')); print(pid, rgba.size)
