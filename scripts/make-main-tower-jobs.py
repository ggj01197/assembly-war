# 메인 타워(기지) 전용 건물 그림 — 사이드 포탑과 다른 큰 지휘 요새 (CEO 2026-10-23). Codex 로 앞모습·뒷모습 2×2 시트(멀쩡·손상·파괴·발사).
import os, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPR = os.path.join(ROOT, 'public', 'sprites', 'tower')
OUT = os.path.abspath(os.path.join(ROOT, '..', '00_PROJECT_CONTROL', 'art-src', 'main-tower'))
jobs = []
for side, view in (('f', 'seen from the front/side three-quarter view (camera in front of it)'), ('b', 'seen from BEHIND (camera behind it, three-quarter back view)')):
    jobs.append({'out': os.path.join(OUT, f'main_{side}.png'), 'refs': [os.path.join(SPR, f'tower_{side}_ok.png')], 'size': [1024, 1024], 'prompt':
        f'ref1.png is a small defense turret tower from a sci-fi mech strategy game (3D-rendered game sprite). Design a DIFFERENT, clearly BIGGER and more imposing MAIN COMMAND FORTRESS for the same game, {view}, in the exact same art style, materials and color palette (sage-green and gray armor plates, orange/bronze trim, dark metal). It must NOT look like ref1: make it a wide armored bunker-fortress with a heavy hexagonal base, a large central artillery cannon / twin heavy barrels on top, a small radar dish and antenna mast, glowing cyan or orange command core window, thick shield plating. '
        'Make a 2x2 grid image (four equal square cells, thin gap, PURE WHITE background everywhere, nothing else) showing the SAME fortress in four states, same camera angle and same size in every cell, standing on the same ground line, centered in its cell: cell1 = intact, cell2 = badly damaged (cracked armor, dents, smoke and sparks, one side blackened), cell3 = destroyed (collapsed ruins and rubble, fire and smoke), cell4 = firing (bright muzzle blast and flash at the cannon, recoil). No shadows on the background, no text, no borders.'})
os.makedirs(OUT, exist_ok=True)
json.dump(jobs, open(os.path.join(OUT, 'jobs.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(len(jobs), 'jobs')
