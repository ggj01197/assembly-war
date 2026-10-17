# 파츠 시트(3×3 그리드, 마젠타 배경)를 칸별 투명 PNG 로 자른다 (TD-006).
# 사용: python scripts/cut-sheet.py <시트.png> <출력폴더> <id1,id2,...> [열=3 행=3]   (id 가 '-' 면 그 칸은 건너뜀)
# 마젠타(#FF00FF 근처)를 투명으로 바꾸고, 가장자리 보라 번짐은 색을 되돌린다(디스필). 여백은 잘라낸다.
import sys, os
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
COLS = int(sys.argv[4]) if len(sys.argv) > 4 else 3
ROWS = int(sys.argv[5]) if len(sys.argv) > 5 else 3
ids = sys.argv[3].split(',') if len(sys.argv) > 3 else [f'cell_{i}' for i in range(COLS * ROWS)]
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert('RGB')
W, H = im.size
cw, ch = W // COLS, H // ROWS
PAD = 12  # 격자선 피하기

def key(px):
    r, g, b = px
    # 마젠타 정도: 빨강·파랑이 높고 초록이 낮을수록 배경
    mag = max(0, min(r, b) - g)
    if mag > 150: return 0        # 완전 배경
    if mag > 60:  return int(255 * (1 - (mag - 60) / 90))  # 가장자리 반투명
    return 255

for i, pid in enumerate(ids):
    if pid == '-': continue
    cx, cy = (i % COLS) * cw, (i // COLS) * ch
    cell = im.crop((cx + PAD, cy + PAD, cx + cw - PAD, cy + ch - PAD))
    rgba = Image.new('RGBA', cell.size)
    src_px, dst_px = cell.load(), rgba.load()
    for y in range(cell.size[1]):
        for x in range(cell.size[0]):
            r, g, b = src_px[x, y]
            a = key((r, g, b))
            if 0 < a < 255:
                # 디스필: 보라 번짐을 줄인다 (빨강·파랑을 초록 쪽으로 당김)
                m = (r + b) // 2
                r = min(r, g + (m - g) // 3); b = min(b, g + (m - g) // 3)
            dst_px[x, y] = (r, g, b, a)
    bbox = rgba.getbbox()
    if bbox: rgba = rgba.crop(bbox)
    rgba.save(os.path.join(out, f'{pid}.png'))
    print(pid, rgba.size)
