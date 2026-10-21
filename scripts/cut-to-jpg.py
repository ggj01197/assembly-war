# 컷신 원본 PNG → 앱용 JPG (세로 9:16, 너비 900, 품질 82). 사용: python scripts/cut-to-jpg.py <원본폴더> <출력폴더>
import sys, glob, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in sorted(glob.glob(os.path.join(src, 'c*.png'))):
    im = Image.open(f).convert('RGB')
    w = 900; h = round(im.height * w / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    out = os.path.join(dst, os.path.basename(f)[:-4] + '.jpg')
    im.save(out, 'JPEG', quality=82, optimize=True, progressive=True)
    print(os.path.basename(out), im.size, os.path.getsize(out) // 1024, 'KB')
