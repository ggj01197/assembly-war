# 앱 아이콘 한 장(정사각 1024, 둥근 모서리 없음)에서 iOS·안드로이드·Play 아이콘을 모두 만든다.
#   python scripts/make-icons.py [원본.png]   (기본: ../00_PROJECT_CONTROL/art-src/icon/icon-1024.png)
# 2026-10-11: 프로젝트 생성 때의 Capacitor 기본 아이콘(파란 X)이 그대로 남아 있던 것을 교체 (상황실 지적)
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', '00_PROJECT_CONTROL', 'art-src', 'icon', 'icon-1024.png')
art = Image.open(SRC).convert('RGB').resize((1024, 1024), Image.LANCZOS)

# iOS: 1024 한 장 (투명 없이)
ios = os.path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png')
art.save(ios)

# Play 스토어 512
play = os.path.join(ROOT, '..', '00_PROJECT_CONTROL', 'store-assets', 'play', 'icon-512.png')
art.resize((512, 512), Image.LANCZOS).save(play)

# 안드로이드
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
LEGACY = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
ADAPT = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
# 적응형 아이콘: 기기가 가운데 72/108 만 보여 준다(원·물방울 모양 등). 그림을 70% 로 넣고 바깥은 좌우 배경색으로 채운다
left_c, right_c = art.getpixel((4, 4)), art.getpixel((1019, 4))  # 위 모서리 = 좌우 배경색
for d, n in LEGACY.items():
    folder = os.path.join(RES, f'mipmap-{d}')
    sq = art.resize((n, n), Image.LANCZOS)
    sq.save(os.path.join(folder, 'ic_launcher.png'))
    mask = Image.new('L', (n * 4, n * 4), 0); ImageDraw.Draw(mask).ellipse((0, 0, n * 4 - 1, n * 4 - 1), fill=255)
    rnd = Image.new('RGBA', (n, n), (0, 0, 0, 0)); rnd.paste(sq, (0, 0), mask.resize((n, n), Image.LANCZOS))
    rnd.save(os.path.join(folder, 'ic_launcher_round.png'))
for d, n in ADAPT.items():
    folder = os.path.join(RES, f'mipmap-{d}')
    bg = Image.new('RGB', (n, n), left_c); ImageDraw.Draw(bg).rectangle((n // 2, 0, n, n), fill=right_c)
    a = round(n * 0.70); bg.paste(art.resize((a, a), Image.LANCZOS), ((n - a) // 2, (n - a) // 2))
    bg.save(os.path.join(folder, 'ic_launcher_background.png'))
    Image.new('RGBA', (n, n), (0, 0, 0, 0)).save(os.path.join(folder, 'ic_launcher_foreground.png'))
for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    p = os.path.join(RES, 'mipmap-anydpi-v26', name)
    open(p, 'w', encoding='utf-8').write('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n')
print('icons: ios 1024, play 512, android legacy/round x5, adaptive x5')
