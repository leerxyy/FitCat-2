"""Render FitCat's original short material clicks. Optional asset tool, not a PWA dependency.

Requires Python, NumPy and SciPy. No recordings, downloaded sounds, or network calls.
Run from any directory: python3 tools/generate_audio.py
"""
from pathlib import Path
import hashlib
import json
import wave
import numpy as np
from scipy.signal import butter, sosfilt, resample_poly

ROOT = Path(__file__).resolve().parents[1]
RATE = 44100
# id, length ms, contact decay ms, band-pass Hz, resonant modes (Hz, ms, weight), texture
# Deliberately inharmonic modes with short damping: tactile impacts, not UI melodies.
RECIPES = [
 ('glass',70,4.0,(500,6100),[(1780,8,.32),(2870,6,.18),(4410,4,.08)],.12),
 ('drop',66,7.0,(170,2700),[(830,10,.23),(1470,7,.10),(2360,4,.04)],.08),
 ('velvet',54,7.5,(100,1250),[(245,5,.18),(430,3,.06)],.16),
 ('spark',80,5.0,(230,3900),[(1040,13,.32),(1870,8,.17),(3070,5,.07)],.12),
 ('pulse',42,2.6,(420,3800),[(610,3,.12),(1230,2,.04)],.15),
 ('air',70,8.0,(700,3600),[],.28),
 ('suede',64,9.0,(150,1700),[(330,4,.10)],.35),
 ('felt',56,8.0,(90,920),[(185,6,.20),(380,3,.06)],.14),
 ('silk',74,7.0,(1150,4300),[(2840,2,.025)],.38),
 ('warm',68,8.5,(100,1850),[(285,7,.21),(690,4,.08)],.10),
 ('tick',36,1.9,(1100,5800),[(1940,2,.05)],.12),
 ('graphite',48,3.6,(430,2750),[(720,3,.10),(1780,2,.06)],.34),
 ('wood',82,5.5,(130,2850),[(510,10,.34),(940,6,.20),(1690,4,.10),(2310,3,.04)],.22),
 ('paper',62,5.5,(650,5200),[],.65),
 ('porcelain',90,3.6,(350,5100),[(1460,12,.28),(2570,8,.18),(4370,5,.07)],.10),
 ('matte',84,6.0,(180,3100),[(890,14,.33),(1390,9,.19),(2670,5,.08)],.18),
 ('stone',70,5.0,(100,2350),[(410,9,.28),(730,6,.21),(1240,4,.08)],.20),
 ('crystal',92,3.0,(700,6600),[(2370,11,.20),(3870,7,.11),(5830,4,.04)],.08),
 ('frost',72,4.5,(1700,7000),[(2940,5,.10),(5130,3,.06),(6970,2,.02)],.36),
 ('thin',64,2.6,(950,6200),[(3430,5,.15),(5630,3,.05)],.10),
]


def render(recipe, index):
 identifier, milliseconds, decay_ms, band, modes, texture = recipe
 rng = np.random.default_rng(20261019 + index * 7919)
 t = np.arange(round(RATE * milliseconds / 1000)) / RATE
 noise = rng.normal(0, 1, len(t))
 contact = sosfilt(butter(2, band, fs=RATE, btype='bandpass', output='sos'), noise)
 contact *= (1 - np.exp(-t / .0006)) * np.exp(-t / (decay_ms / 1000))
 signal = contact * .70
 # Several low-level grain contacts make paper/wood/fabric differ in texture.
 for offset, weight in [(1.8,.33),(3.7,.22),(6.2,.10)]:
  shift = round(offset * RATE / 1000)
  grain = np.roll(contact, shift); grain[:shift] = 0
  signal += grain * texture * weight
 for frequency, damping_ms, weight in modes:
  phase = rng.uniform(-np.pi, np.pi)
  envelope = (1 - np.exp(-t / .00045)) * np.exp(-t / (damping_ms / 1000))
  signal += weight * np.sin(2*np.pi*frequency*t + phase) * envelope
 signal = sosfilt(butter(2, 75, fs=RATE, btype='highpass', output='sos'), signal)
 signal = np.tanh(signal * 1.35)
 signal = resample_poly(signal, 1, 2)
 rate = RATE // 2
 attack = max(4, round(.0007 * rate)); release = round(.010 * rate)
 signal[:attack] *= np.linspace(0,1,attack)
 signal[-release:] *= np.linspace(1,0,release)
 rms = float(np.sqrt(np.mean(signal**2))); peak = float(np.max(np.abs(signal)))
 # A restrained common level, with a conservative peak ceiling for phone speakers.
 target_rms = .075 if identifier not in ('velvet','felt','silk') else .062
 signal *= min(target_rms/rms, .48/peak)
 signal[0] = signal[-1] = 0
 pcm = np.round(signal * 32767).astype('<i2')
 return identifier, pcm, rate


def main():
 target = ROOT/'assets/audio'; target.mkdir(parents=True,exist_ok=True)
 report = []
 for index, recipe in enumerate(RECIPES):
  identifier, pcm, rate = render(recipe, index)
  output = target/(identifier+'.wav')
  with wave.open(str(output),'wb') as writer:
   writer.setnchannels(1); writer.setsampwidth(2); writer.setframerate(rate); writer.writeframes(pcm.tobytes())
  report.append({'id':identifier,'duration_ms':round(len(pcm)/rate*1000,2),'peak':round(float(np.max(np.abs(pcm)))/32767,4),'rms':round(float(np.sqrt(np.mean((pcm.astype(float)/32767)**2))),4),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
 print(json.dumps({'samples':report,'total_bytes':sum(row['bytes'] for row in report)},indent=2))


if __name__ == '__main__':
 main()
