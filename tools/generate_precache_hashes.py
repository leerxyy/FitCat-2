"""Refresh byte hashes after editing runtime files; no image conversion."""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parents[1]
worker = root / 'sw.js'
text = worker.read_text()
array = re.search(r'const APP_FILES = \[(.*?)\n\];', text, re.S).group(1)
files = re.findall(r"'([^']+)'", array)
assert len(files) == len(set(files)), 'Duplicate offline resource'
hashes = {}
for name in files:
    path = root / ('index.html' if name == './' else name)
    assert path.is_file(), f'Missing offline resource: {name}'
    hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
replacement = '// BEGIN ASSET HASHES — regenerate with python3 tools/generate_precache_hashes.py\nconst ASSET_HASHES = ' + json.dumps(hashes, indent=2, ensure_ascii=False) + ';\n// END ASSET HASHES'
text = re.sub(r'// BEGIN ASSET HASHES.*?// END ASSET HASHES', lambda _: replacement, text, flags=re.S)
worker.write_text(text)
print(f'{len(hashes)} offline resources hashed')
