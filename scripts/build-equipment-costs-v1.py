from pathlib import Path
import hashlib
import subprocess

# Existing equipment module passed engine and mobile UI regression tests.
# Leave it, authentication, vehicle/labor modules and report save logic unchanged.
root = Path(__file__).resolve().parents[1]
page = root / 'docs/index.html'
target = root / 'docs/equipment-cost-admin.js'
def blob_sha(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

assert blob_sha(target.read_bytes()) == 'cc0fdee20b1efb34fec7ce67049ed8292a480050', 'Equipment module changed; review first'
subprocess.run(['node','--check',str(target)],check=True)
tag = '<script src="equipment-cost-admin.js?v=20260909-equipment-v1"></script>'
before = page.read_text()
if tag in before:
    print('Equipment module already enabled; no change')
else:
    assert blob_sha(page.read_bytes()) == '13c3820f234004a02d482b59903a0407b04e2913', 'App changed; review first'
    end = '\n</body>\n</html>'
    assert before.count(end) == 1, 'Document end ambiguous; stop'
    after = before.replace(end, '\n'+tag+end)
    assert after.replace(tag+'\n','') == before, 'Only one script reference may be added'
    page.write_text(after)
    print('Only the verified equipment script reference was added')
