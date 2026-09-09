from pathlib import Path
import base64, hashlib, json, subprocess, zlib
ROOT = Path(__file__).resolve().parents[1]
payload = ''.join((ROOT / 'scripts' / ('employee-activity-v1.part' + str(i))).read_text().strip() for i in (1,2))
if hashlib.sha256(payload.encode()).hexdigest() != 'b894320114134bcb87559be6c6496ee80b1fab0db062a59d293463f6cf8f3335':
    raise RuntimeError('Employee summary payload mismatch; publishing stopped')
files = json.loads(zlib.decompress(base64.b64decode(payload)))
if set(files) != {'docs/employee-activity-summary.js','tests/employee-activity-summary.cjs'}:
    raise RuntimeError('Unexpected file target')
def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
index = ROOT / 'docs/index.html'
original = index.read_bytes()
marker = '<script src="employee-activity-summary.js?v=20260909-employee-v1"></script>\n'
clean = original.decode('utf-8').replace(marker, '')
if blob(clean.encode('utf-8')) != '3a99718a09326170c3270eebecc7803144716cb6':
    raise RuntimeError('App changed concurrently; do not overwrite')
for path, content in files.items():
    p = ROOT / path
    if p.exists() and p.read_text() != content:
        raise RuntimeError('Unexpected existing employee summary: ' + path)
for path, content in files.items():
    p=ROOT/path
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(content,encoding='utf-8')
    subprocess.run(['node','--check',str(p)],check=True)
subprocess.run(['node',str(ROOT/'tests/employee-activity-summary.cjs')],check=True)
pos=clean.rfind('</body>')
if pos < 0 or clean[pos:].strip() != '</body>\n</html>':
    raise RuntimeError('Unexpected app closing boundary')
index.write_text(clean[:pos]+marker+clean[pos:],encoding='utf-8')
assert index.read_text().replace(marker,'') == clean
print('Employee-only summary verified. Existing app content unchanged except one script link; no financial or database writes.')
