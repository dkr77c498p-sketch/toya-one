from pathlib import Path
import base64, hashlib, json, subprocess, zlib
ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ''.join((ROOT / 'scripts' / ('hourly-patch-part-' + str(i) + '.b64')).read_text().strip() for i in (1, 2, 3))
def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
files = json.loads(zlib.decompress(base64.b64decode(PAYLOAD)))
allowed = ['docs/usage-hours.js', 'docs/pending-transport-tools.js', 'docs/site-financial-summary.js', 'docs/labor-cost-admin.js', 'docs/vehicle-cost-admin.js', 'docs/equipment-cost-admin.js', 'docs/index.html', 'tests/hourly-usage-and-transport.cjs']
if sorted(x['path'] for x in files) != sorted(allowed):
    raise RuntimeError('Unexpected target file set')
staged = {}
for f in files:
    path = ROOT / f['path']
    old = path.read_bytes() if path.exists() else None
    if old is not None and blob(old) == f['after']:
        continue
    if (blob(old) if old is not None else None) != f['before']:
        raise RuntimeError('Concurrent change; stop: ' + f['path'])
    lines = (old or b'').decode('utf-8').splitlines(keepends=True)
    for c in reversed(f['changes']):
        lines[c['start']:c['end']] = c['text'].splitlines(keepends=True)
    data = ''.join(lines).encode('utf-8')
    if blob(data) != f['after']:
        raise RuntimeError('Generated content mismatch: ' + f['path'])
    staged[path] = data
for path, data in staged.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
for f in files:
    if f['path'].endswith(('.js', '.cjs')):
        subprocess.run(['node', '--check', str(ROOT / f['path'])], check=True)
subprocess.run(['node', str(ROOT / 'tests/hourly-usage-and-transport.cjs')], check=True)
print('Verified hourly usage, existing overrides, and pending transport. No database writes.')
