"""Small original static textures; CSS supplies the continuous motion."""
from pathlib import Path
from random import Random

OUT = Path(__file__).resolve().parents[1] / 'assets/profile-effects'
OUT.mkdir(parents=True, exist_ok=True)

def rain(seed, count, near=False):
    rng = Random(seed)
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256" viewBox="0 0 512 256"><defs><linearGradient id="rain" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b2d6ee" stop-opacity="0"/><stop offset=".75" stop-color="#c7e9ff" stop-opacity=".58"/><stop offset="1" stop-color="#eaf6ff" stop-opacity="0"/></linearGradient></defs>']
    for _ in range(count):
        x, y = rng.uniform(0, 512), rng.uniform(0, 256)
        length = rng.uniform(12, 25) if near else rng.uniform(5, 14)
        width = rng.uniform(.45, .8) if near else rng.uniform(.25, .5)
        opacity = rng.uniform(.3, .9)
        # Wrap at the vertical seam so repeated textures never introduce a gap.
        for shift in [0, -256] if y + length > 256 else [0]:
            parts.append(f'<path d="M{x:.2f} {y+shift:.2f}l-2.1 {length:.2f}" fill="none" stroke="url(#rain)" stroke-width="{width:.2f}" opacity="{opacity:.2f}"/>')
    parts.append('</svg>')
    return ''.join(parts)

def fog(seed, near=False):
    rng = Random(seed)
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><radialGradient id="mist"><stop stop-color="#bbd8ea" stop-opacity=".22"/><stop offset=".48" stop-color="#99bfd8" stop-opacity=".09"/><stop offset="1" stop-color="#96c6e2" stop-opacity="0"/></radialGradient><radialGradient id="neon"><stop stop-color="#ba96d4" stop-opacity=".11"/><stop offset="1" stop-color="#a5bbdc" stop-opacity="0"/></radialGradient></defs>']
    for i in range(14):
        x = rng.uniform(-40, 680)
        y = rng.uniform(160, 340) if near else rng.uniform(80, 275)
        rx, ry = rng.uniform(95, 180), rng.uniform(20, 48)
        parts.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="url(#{"neon" if i%4 == 0 else "mist"})"/>')
    return ''.join(parts) + '</svg>'

(OUT / 'city-rain-far.svg').write_text(rain(3041, 64))
(OUT / 'city-rain-near.svg').write_text(rain(5231, 23, True))
(OUT / 'city-fog-far.svg').write_text(fog(1031))
(OUT / 'city-fog-near.svg').write_text(fog(2089, True))
print('Generated 87 rain streaks in two textures and two soft fog planes.')
