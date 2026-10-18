"""Build the small, deterministic vector textures used by profile cosmetics."""
from pathlib import Path
import math
import random

ROOT = Path(__file__).resolve().parents[1] / 'assets/profile-effects'
ROOT.mkdir(parents=True, exist_ok=True)
def svg(body):
    return '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240" preserveAspectRatio="none">' + body + '</svg>\n'

rng = random.Random(391154)
points = []
while len(points) < 54:
    point = (rng.uniform(9, 471), rng.uniform(7, 114))
    if all(math.hypot(point[0] - x, point[1] - y) > 17.8 for x, y in points):
        points.append(point)
rng.shuffle(points)
start = 0
for band, size in enumerate([17, 15, 13, 9], 1):
    body = '<defs><radialGradient id="glow"><stop stop-color="#e7f8ff" stop-opacity=".65"/><stop offset=".3" stop-color="#9cd5ff" stop-opacity=".28"/><stop offset="1" stop-color="#89bfff" stop-opacity="0"/></radialGradient></defs>'
    for index, (x, y) in enumerate(points[start:start + size]):
        radius = rng.uniform(.8, 1.55)
        if index < 2:
            body += f'<circle cx="{x:.2f}" cy="{y:.2f}" r="3.7" fill="url(#glow)"/>'
            radius = 1.5
        body += f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{radius:.2f}" fill="{rng.choice(["#eff9ff", "#bfdcff", "#d9eaff", "#fff1df"])}" opacity="{rng.uniform(.6, .96):.2f}"/>'
    name = 'stars.svg' if band == 1 else f'stars-{band}.svg'
    (ROOT / name).write_text(svg(body))
    start += size

def curtain(seed, green=True):
    light_rng = random.Random(seed)
    core = '#b6ffe4' if green else '#c7bdff'
    mid = '#53e8c8' if green else '#859eea'
    edge = '#37a3c7' if green else '#6677cb'
    body = f'''<defs><radialGradient id="wisp" cx=".5" cy=".56" r=".5"><stop stop-color="{core}" stop-opacity=".38"/><stop offset=".24" stop-color="{mid}" stop-opacity=".23"/><stop offset=".64" stop-color="{edge}" stop-opacity=".07"/><stop offset="1" stop-color="{edge}" stop-opacity="0"/></radialGradient><linearGradient id="arc"><stop stop-color="{edge}" stop-opacity="0"/><stop offset=".28" stop-color="{mid}"/><stop offset=".72" stop-color="{core}"/><stop offset="1" stop-color="{edge}" stop-opacity="0"/></linearGradient></defs>'''
    x = -20
    while x < 500:
        bend = 72 + math.sin(x / 53 + (0 if green else 1.8)) * 20
        height = light_rng.uniform(34, 75)
        body += f'<ellipse cx="{x:.2f}" cy="{bend - height * .23:.2f}" rx="{light_rng.uniform(3.4, 9):.2f}" ry="{height:.2f}" fill="url(#wisp)" opacity="{light_rng.uniform(.4, .95):.2f}"/>'
        x += light_rng.uniform(4, 8.5)
    curve = 'M-30 68C45 29 98 104 169 80S284 29 350 67 428 99 510 52' if green else 'M-30 91C60 115 108 39 192 63S318 119 390 77 463 43 510 60'
    for width, opacity in [(22, .015), (15, .022), (10, .027), (6, .04), (3, .055), (1, .08)]:
        body += f'<path d="{curve}" fill="none" stroke="url(#arc)" stroke-width="{width}" opacity="{opacity}" stroke-linecap="round"/>'
    return svg(body)

(ROOT / 'aurora.svg').write_text(curtain(12731, True))
(ROOT / 'aurora-far.svg').write_text(curtain(63409, False))


gradient = '''<defs><radialGradient id="cool"><stop stop-color="#e5edf9" stop-opacity=".8"/><stop offset=".35" stop-color="#cfddf1" stop-opacity=".42"/><stop offset=".7" stop-color="#a6bcdc" stop-opacity=".12"/><stop offset="1" stop-color="#9cb0d2" stop-opacity="0"/></radialGradient><radialGradient id="warm"><stop stop-color="#ffebe0" stop-opacity=".7"/><stop offset=".4" stop-color="#dfd5ec" stop-opacity=".3"/><stop offset="1" stop-color="#c9c0dc" stop-opacity="0"/></radialGradient></defs>'''
(ROOT / 'mist.svg').write_text(svg(gradient + '<ellipse cx="80" cy="148" rx="240" ry="33" fill="url(#cool)"/><ellipse cx="302" cy="137" rx="260" ry="35" fill="url(#warm)"/><ellipse cx="465" cy="183" rx="265" ry="44" fill="url(#cool)"/>'))
(ROOT / 'mist-far.svg').write_text(svg(gradient + '<ellipse cx="104" cy="93" rx="250" ry="28" fill="url(#cool)" transform="rotate(-4 104 93)"/><ellipse cx="362" cy="113" rx="240" ry="31" fill="url(#warm)" transform="rotate(4 362 113)"/>'))
print('54 stars / 4 groups; 2 aurora curtains; 2 fog planes. No animated SVG filters.')
