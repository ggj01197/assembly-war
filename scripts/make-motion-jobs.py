# Codex 로 부품별 동작 그림(2x2 시트) 작업 목록 만들기 (CEO 2026-10-23: 모든 조합이 자연스럽게 움직이도록)
#   python scripts/make-motion-jobs.py legs|weapons  →  00_PROJECT_CONTROL/art-src/motion/jobs_<종류>.json
#   그 뒤  python scripts/codex-gen.py <jobs.json> 4   (이미 있는 그림은 건너뜀)
#   시트 칸: ① ② ③ ④ = 한 번 도는 동작의 네 장면 (흰 바탕, 같은 크기·같은 시점·같은 그림체)
import os, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CTRL = os.path.abspath(os.path.join(ROOT, '..', '00_PROJECT_CONTROL', 'art-src', 'motion'))
SPR = os.path.join(ROOT, 'public', 'sprites')

LEGS = {
    'legs_biped_light': 'walk', 'legs_biped_assault': 'walk', 'legs_quad_walker': 'walk', 'legs_quad_siege': 'walk',
    'legs_track_light': 'track', 'legs_track_heavy': 'track', 'legs_track_fortress': 'track',
    'legs_wheel_scout': 'wheel', 'legs_wheel_heavy': 'wheel',
    'legs_hover': 'hover', 'legs_hover_heavy': 'hover', 'legs_flyer': 'fly',
}
LEG_TXT = {
    'walk': 'four frames of a natural walking cycle: cell1 = left leg planted forward and right leg trailing (contact pose), cell2 = passing pose (right leg lifted off the ground with the knee bent), cell3 = right leg planted forward and left leg trailing (contact pose, mirrored), cell4 = passing pose (left leg lifted). Feet touch the same ground line in cells 1 and 3; lifted feet in cells 2 and 4',
    'track': 'four frames of a rolling tracked undercarriage in motion: the tread links / track plates / road wheels are at four different phases of the loop (each frame shifted a quarter of a link pitch along the track, wheels rotated a quarter turn), the hull bobbing very slightly on the suspension (frame 2 and 4 hull a few pixels lower). Same overall silhouette in every cell',
    'wheel': 'four frames of rolling wheels in motion: every wheel rotated by a quarter turn between frames (hub bolts, spokes and tread blocks at four different angles), the suspension compressing a little (cells 2 and 4 body a few pixels lower). Same overall silhouette in every cell',
    'hover': 'four frames of a hovering thruster unit: the thruster glow and vents pulse (cell1 dim, cell2 medium with small exhaust puffs, cell3 bright with a stronger blue-white exhaust, cell4 medium), the skirt / fins flexing a little, the whole unit bobbing a few pixels up and down (cell3 highest). Same silhouette otherwise',
    'fly': 'four frames of a flying machine in flight: the rotors / wings / flaps are at four different phases of their beat (cell1 raised, cell2 mid-down, cell3 lowest, cell4 mid-up), engines glowing, the body bobbing a few pixels. Same overall design in every cell',
}
WPN_TXT = {
    'gatling': 'four frames of a rotary gatling being fired: cell1 = idle / ready, cell2 = barrels spinning up (slight motion blur on the barrel cluster), cell3 = firing (bright muzzle flash at the front of the barrels, barrels blurred), cell4 = firing recoil (the whole weapon pushed back a few pixels, flash fading)',
    'cannon': 'four frames of a cannon firing: cell1 = idle / ready, cell2 = barrel pulling back slightly (charge), cell3 = firing (bright muzzle blast and flash at the muzzle, smoke), cell4 = recoil (barrel slid back into the housing, thin smoke curling)',
    'missile': 'four frames of a missile launcher firing: cell1 = idle / ready with missiles loaded, cell2 = hatches / pods opening, cell3 = launching (bright rear flame and smoke at the launcher, one missile leaving), cell4 = just after launch (smoke trail, an empty tube)',
    'laser': 'four frames of an energy weapon firing: cell1 = idle (dim glow), cell2 = charging (energy coils glowing brighter, small sparks), cell3 = firing (very bright glowing core and a flash at the emitter tip), cell4 = cooling (glow fading, small steam wisps)',
    'blade': 'four frames of a melee weapon in motion with a subtle energy glow: cell1 = idle (dim glow), cell2 = glow brightening as it is raised, cell3 = peak glow with a motion streak along the edge, cell4 = glow fading',
    'flak': 'four frames of an anti-air flak weapon firing: cell1 = idle, cell2 = barrels rising slightly, cell3 = firing (bright flash and puff at the muzzles), cell4 = recoil (weapon pushed back, smoke)',
    'repair': 'four frames of a repair tool in use: cell1 = idle (dim green glow), cell2 = emitter extending / charging (glow brighter), cell3 = active (bright green repair energy glowing at the tip, small sparkles), cell4 = glow pulsing down',
    'mortar': 'four frames of a mortar firing: cell1 = idle / ready, cell2 = tube recoiling downward as the shell leaves, cell3 = launch (big muzzle flash and smoke puff at the tube mouth), cell4 = settling back (smoke rising)',
}


def wfam(wid):
    for k in ('gatling', 'cannon', 'missile', 'laser', 'blade', 'flak', 'repair', 'mortar'):
        if k in wid: return k
    return {'wpn_arm_gatling': 'gatling', 'wpn_turret_cannon': 'cannon', 'wpn_shoulder_missile': 'missile'}.get(wid, 'cannon')


def job(kind, pid, side, txt, what):
    src = os.path.join(SPR, 'parts' if side == 'front' else 'parts_back', pid + '.png')
    out = os.path.join(CTRL, kind, f'{pid}_{side}.png')
    view = 'seen from the front/side three-quarter view' if side == 'front' else 'seen from BEHIND (the camera is behind the mech, three-quarter back view)'
    return {'out': out, 'refs': [src], 'size': [1024, 1024], 'prompt': (
        f'ref1.png is {what} of a game mech (3D-rendered game sprite, {view}). Make a 2x2 grid image (four equal square cells with a thin gap, PURE WHITE background everywhere, nothing else) showing the SAME part in {txt}. '
        'Keep the exact same camera angle, same size, same proportions, same colors, same materials, same art style and same design as ref1 in every cell; the part must stay centered in its cell and fully visible, with the mounting point (top plate / attachment point) in the same position in every cell. No shadows, no text, no borders, no extra objects.')}


if __name__ == '__main__':
    kind = sys.argv[1] if len(sys.argv) > 1 else 'legs'
    jobs = []
    if kind == 'legs':
        for pid, t in LEGS.items():
            for side in ('front', 'back'):
                if os.path.exists(os.path.join(SPR, 'parts' if side == 'front' else 'parts_back', pid + '.png')):
                    jobs.append(job('legs', pid, side, LEG_TXT[t], 'the undercarriage / legs'))
    else:
        for f in sorted(os.listdir(os.path.join(SPR, 'parts'))):
            pid = f[:-4]
            if not pid.startswith('wpn_'): continue
            for side in ('front', 'back'):
                if os.path.exists(os.path.join(SPR, 'parts' if side == 'front' else 'parts_back', pid + '.png')):
                    jobs.append(job('weapons', pid, side, WPN_TXT[wfam(pid)], 'a weapon'))
    os.makedirs(CTRL, exist_ok=True)
    p = os.path.join(CTRL, f'jobs_{kind}.json')
    json.dump(jobs, open(p, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    print(len(jobs), 'jobs →', p)
