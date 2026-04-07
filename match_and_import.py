#!/usr/bin/env python3
"""
match_and_import.py
-------------------
1. Reads flow_full_prompts.csv and scans Allpics/ for images.
2. Groups images by base-title (strips timestamp + duplicate suffix).
3. Matches each group to a CSV prompt using word-overlap + stemming scoring.
4. Writes match_report.csv so you can review before importing.
5. On --import flag: replaces all imp_* cards in state.json with the
   correctly-matched prompts+images and bakes state into index.html.

Usage:
  python match_and_import.py              # dry run: produces match_report.csv
  python match_and_import.py --import     # writes state.json + index.html
"""

import csv, re, os, sys, json, shutil, argparse
from collections import Counter, defaultdict

try:
    from PIL import Image as PILImage
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print('WARNING: Pillow not installed. Images will be copied without compression.')
    print('  Install with: pip install Pillow')

MAX_IMG_DIM  = 800  # max width or height in pixels after resize
JPEG_QUALITY = 82   # JPEG quality; 82 gives ~150-200 KB for typical AI portrait

# ── paths ──────────────────────────────────────────────────────────────────────
ALLPICS_DIR  = r'C:\Users\Tom Brill\Downloads\Allpics'
CSV_FILE     = os.path.join(ALLPICS_DIR, 'flow_full_prompts.csv')
REPO_DIR     = r'C:\Users\Tom Brill\Desktop\ClaudeCode\prompts\brill-banana-prompts'
STATE_FILE   = os.path.join(REPO_DIR, 'state.json')
INDEX_FILE   = os.path.join(REPO_DIR, 'index.html')
IMG_DEST_DIR = os.path.join(REPO_DIR, 'images')
REPORT_FILE  = os.path.join(REPO_DIR, 'match_report.csv')

# ── helpers ────────────────────────────────────────────────────────────────────
STOPWORDS = {
    'a','an','the','of','in','on','at','to','for','and','or','with','is','are',
    'as','by','it','its','my','me','i','into','from','this','that','be','has',
    'have','your','their','image','photo','picture','using','use','create',
    'make','style','like','very','also','but','not','so','do','if','all','just',
    'one','two','three','can','will','you','them','they','her','his','our',
    'who','what','when','where','how','new','old','big','small','add','some',
    'any','more','most','than','then','these','those','there','here','was',
    'were','been','being','had','did','get','got','set','put','out','up','down',
    'over','under','around','about','after','before',
}

def normalize(s):
    s = s.lower()
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def stem(w):
    """Lightweight English stemmer - strips common suffixes."""
    for sfx in ('ings','ing','tion','tions','ness','ment','ments',
                'ies','es','ed','ly','er','ers','est','ful','less',
                'ion','ions','al','ial'):
        if w.endswith(sfx) and len(w) - len(sfx) >= 4:
            return w[:-len(sfx)]
    if w.endswith('s') and len(w) > 4:
        return w[:-1]
    return w

def title_words(base):
    """Return meaningful keywords from an image base-title."""
    norm = normalize(base)
    return [w for w in norm.split() if w not in STOPWORDS and len(w) > 2]

def score_match(tw, prompt_words_list):
    """Count title keywords found in prompt (exact or stemmed)."""
    pset    = set(prompt_words_list)
    pstems  = set(stem(w) for w in pset)
    return sum(1 for w in tw if w in pset or stem(w) in pstems)

def extract_base(fn):
    """Strip ext, trailing duplicate suffix (_2 _3...), and timestamp."""
    base = os.path.splitext(fn)[0]
    base = re.sub(r'_\d+$', '', base)           # _2, _3, ...
    base = re.sub(r'_\d{12,14}$', '', base)     # _202604061446 etc.
    return base

def make_title(base):
    """Turn 'Character_in_cyberpunk' into 'Character In Cyberpunk'."""
    words = re.sub(r'[_\-]', ' ', base).split()
    return ' '.join(w.capitalize() for w in words[:4])

# ── load CSV ───────────────────────────────────────────────────────────────────
print('Loading CSV...')
csv_rows = []
with open(CSV_FILE, encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        csv_rows.append(row)
print(f'  {len(csv_rows)} rows')

prompt_counter  = Counter(r['Prompt'] for r in csv_rows)
unique_prompts  = list(prompt_counter.items())   # [(text, count), ...]
prompt_words    = {p: normalize(p).split() for p, _ in unique_prompts}
print(f'  {len(unique_prompts)} unique prompts')

# ── scan images ────────────────────────────────────────────────────────────────
print('Scanning images...')
all_imgs = sorted(
    f for f in os.listdir(ALLPICS_DIR)
    if f.lower().endswith(('.jpg', '.jpeg', '.png'))
)
print(f'  {len(all_imgs)} images found')

groups = defaultdict(list)   # base_title -> [filenames]
for fn in all_imgs:
    groups[extract_base(fn)].append(fn)
print(f'  {len(groups)} unique title groups')

# ── match ──────────────────────────────────────────────────────────────────────
print('Matching...')
matches = {}   # base -> dict

for base, fns in groups.items():
    tw     = title_words(base)
    n_imgs = len(fns)

    scored = []
    for prompt, cnt in unique_prompts:
        s = score_match(tw, prompt_words[prompt])
        scored.append((s, cnt, prompt))
    scored.sort(key=lambda x: -x[0])

    best_score      = scored[0][0]
    best_candidates = [(s, c, p) for s, c, p in scored if s == best_score]

    # Prefer candidate where CSV count == image count
    count_matched = [c for c in best_candidates if c[1] == n_imgs]
    if count_matched:
        chosen    = count_matched[0][2]
        ambiguous = len(count_matched) > 1
        count_ok  = True
    else:
        chosen    = best_candidates[0][2]
        ambiguous = len(best_candidates) > 1
        count_ok  = False

    matches[base] = {
        'prompt':    chosen,
        'score':     best_score,
        'count_ok':  count_ok,
        'ambiguous': ambiguous,
        'n_imgs':    n_imgs,
        'csv_count': prompt_counter[chosen],
        'files':     fns,
    }

# ── write match report ─────────────────────────────────────────────────────────
print(f'Writing report to {REPORT_FILE}...')
with open(REPORT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['base_title','n_imgs','csv_count','score','count_ok','ambiguous','files','prompt'])
    for base, m in sorted(matches.items()):
        w.writerow([
            base, m['n_imgs'], m['csv_count'], m['score'],
            m['count_ok'], m['ambiguous'],
            ' | '.join(m['files']),
            m['prompt'],
        ])

no_match  = sum(1 for m in matches.values() if m['score'] == 0)
count_ok  = sum(1 for m in matches.values() if m['count_ok'])
ambiguous = sum(1 for m in matches.values() if m['ambiguous'])
total     = len(matches)
print(f'\n=== Match Summary ===')
print(f'  Total groups   : {total}')
print(f'  Score=0 (skip) : {no_match}')
print(f'  Count matches  : {count_ok}')
print(f'  Ambiguous      : {ambiguous}')
print(f'  Clean matches  : {total - no_match - ambiguous}')

imgs_to_import = sum(m['n_imgs'] for m in matches.values() if m['score'] > 0)
print(f'  Images to import: {imgs_to_import}')
print(f'\nReview {REPORT_FILE} before running --import')

# ── optional import ────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument('--import', dest='do_import', action='store_true')
args = parser.parse_args()

if not args.do_import:
    print('\nRun with --import to apply changes.')
    sys.exit(0)

# ── load state ─────────────────────────────────────────────────────────────────
print('\nLoading state.json...')
with open(STATE_FILE, encoding='utf-8') as f:
    state = json.load(f)

# Remove old imp_ cards (identified by key starting with 'added_imp_')
old_imp = [c for c in state.get('added', []) if c.get('key', '').startswith('added_imp_')]
print(f'  Removing {len(old_imp)} old imp_ cards...')
state['added'] = [c for c in state.get('added', [])
                  if not c.get('key', '').startswith('added_imp_')]

# Delete old imp_ image files
os.makedirs(IMG_DEST_DIR, exist_ok=True)
removed = sum(
    1 for fn in os.listdir(IMG_DEST_DIR)
    if re.match(r'^imp_\d{4}\.jpg$', fn)
    and not os.remove(os.path.join(IMG_DEST_DIR, fn))  # remove() returns None -> falsy
)
print(f'  Removed {removed} old image files.')

# ── compress and copy images ───────────────────────────────────────────────────
print('\nCompressing and copying images...')

def save_compressed(src, dest):
    if HAS_PIL:
        try:
            img = PILImage.open(src)
            img = img.convert('RGB')
            w, h = img.size
            if w > MAX_IMG_DIM or h > MAX_IMG_DIM:
                ratio = min(MAX_IMG_DIM / w, MAX_IMG_DIM / h)
                img = img.resize((int(w * ratio), int(h * ratio)), PILImage.LANCZOS)
            img.save(dest, 'JPEG', quality=JPEG_QUALITY, optimize=True)
            return
        except Exception as e:
            print(f'  PIL error ({e}) -- copying without compression')
    shutil.copy2(src, dest)

new_cards = []
idx = 0

for base, m in sorted(matches.items()):
    if m['score'] == 0:
        print(f'  SKIP: {base}')
        continue
    title = make_title(base)
    card_images = []
    for fn in sorted(m['files']):
        dest_name = f'imp_{idx:04d}.jpg'
        save_compressed(os.path.join(ALLPICS_DIR, fn),
                        os.path.join(IMG_DEST_DIR, dest_name))
        card_images.append(f'images/{dest_name}')
        idx += 1
        if idx % 100 == 0:
            print(f'  ... {idx} images done')

    # One card per image
    for img_path in card_images:
        imp_num = re.search(r'imp_(\d+)', img_path).group(1)
        new_cards.append({
            'key':    f'added_imp_{imp_num}',
            'id':     'new',
            'title':  title,
            'cat':    '',
            'prompt': m['prompt'],
            'images': [img_path],
        })

print(f'  {idx} images processed, {len(new_cards)} cards created')

# ── update state.json ──────────────────────────────────────────────────────────
print('\nUpdating state.json...')
state['added'].extend(new_cards)
with open(STATE_FILE, 'w', encoding='utf-8') as f:
    json.dump(state, f, ensure_ascii=False, indent=2)
print(f'  {len(state["added"])} total added cards ({len(old_imp)} replaced -> {len(new_cards)} new)')

# ── bake state into index.html ─────────────────────────────────────────────────
print('\nBaking state into index.html...')
with open(INDEX_FILE, encoding='utf-8') as f:
    html = f.read()

state_json  = json.dumps(state, ensure_ascii=False)
# The baked state ends with '}}}; // baked-in default state'
pattern     = r'var state\s*=\s*\{.*?\}; // baked-in default state'
replacement = f'var state = {state_json}; // baked-in default state'

if re.search(pattern, html, re.DOTALL):
    html = re.sub(pattern, replacement, html, flags=re.DOTALL)
    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        f.write(html)
    print('  index.html baked.')
else:
    print('  WARNING: bake marker not found -- only state.json updated')

total_mb = sum(
    os.path.getsize(os.path.join(IMG_DEST_DIR, f))
    for f in os.listdir(IMG_DEST_DIR) if f.endswith('.jpg')
) / 1024 / 1024
print(f'\n  images/ total: {total_mb:.1f} MB')
print('\nDone!  git add -A && git commit -m "bulk import 1336 images" && git push')
