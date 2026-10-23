# Codex CLI(ChatGPT 로그인)로 그림 여러 장 만들기 — 작업 목록 JSON 하나로.
#   python scripts/codex-gen.py <jobs.json> [동시수]
#   jobs.json: [{"out": "경로.png|.jpg", "prompt": "...", "refs": ["참고그림", ...], "size": [W, H]}]
#   out 이 이미 있으면 건너뛴다. refs 는 프롬프트에서 ref1.png, ref2.png … 이름으로 부른다. size 가 있으면 그 크기로 맞춰 저장(비율이 다르면 가운데를 자름).
import os, re, sys, json, shutil, subprocess, time
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, '..', '00_PROJECT_CONTROL', 'art-src', '_codex_work')
# 코덱스 앱이 업데이트되면 설치 폴더(버전 번호)가 바뀐다 → 매번 찾는다
CODEX = os.path.join(subprocess.run(['powershell', '-NoProfile', '-Command', '(Get-AppxPackage -Name OpenAI.Codex).InstallLocation'], capture_output=True, text=True).stdout.strip(), 'app', 'resources', 'codex.exe')
TAIL = '\nUse your image generation tool. When the image is generated, copy the resulting PNG file into the current working directory as out.png. Then reply with just "done".'


def fit(im, size):
    W, H = size
    k = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def one(job):
    out = job['out']
    if os.path.exists(out): return out, 'skip'
    for attempt in range(3):
        w = os.path.join(WORK, f'gen_{os.path.splitext(os.path.basename(out))[0]}_{attempt}_{int(time.time())}'); os.makedirs(w)
        args = [CODEX, 'exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '--add-dir', os.path.expanduser(r'~\.codex\generated_images')]
        for i, r in enumerate(job.get('refs', [])):
            dst = os.path.join(w, f'ref{i + 1}.png'); Image.open(r).convert('RGBA').save(dst); args += ['-i', dst]
        with open(os.path.join(w, 'log.txt'), 'w', encoding='utf8') as log:
            subprocess.run(args + ['-'], input=job['prompt'] + TAIL, text=True, encoding='utf8', cwd=w, stdout=log, stderr=subprocess.STDOUT, timeout=1500)
        logtxt = open(os.path.join(w, 'log.txt'), encoding='utf8', errors='ignore').read()
        sid = re.search(r'session id: ([0-9a-f-]+)', logtxt)  # 그림은 ~/.codex/generated_images/<session id>/ 에 남는다
        gdir = os.path.join(os.path.expanduser('~/.codex'), 'generated_images', sid.group(1)) if sid else ''
        gen = sorted((os.path.join(gdir, f) for f in os.listdir(gdir) if f.endswith('.png')), key=os.path.getmtime, reverse=True) if gdir and os.path.isdir(gdir) else []
        for src in gen + [os.path.join(w, 'out.png')]:
            try:
                im = Image.open(src); im.load()
            except OSError:
                continue
            if job.get('size'): im = fit(im.convert('RGBA' if out.endswith('.png') else 'RGB'), job['size'])
            os.makedirs(os.path.dirname(out), exist_ok=True)
            if out.endswith('.jpg'): im.convert('RGB').save(out, quality=86, optimize=True)
            else: im.save(out, optimize=True)
            return out, f'ok ({attempt + 1})'
        time.sleep(30)
    return out, f'FAIL (log {w})'


if __name__ == '__main__':
    os.makedirs(WORK, exist_ok=True)
    jobs = json.load(open(sys.argv[1], encoding='utf8'))
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    with ThreadPoolExecutor(n) as ex:
        for o, r in ex.map(one, jobs):
            print(f'[gen] {os.path.basename(o)} {r}', flush=True)
