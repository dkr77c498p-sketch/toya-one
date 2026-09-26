"""Narrow site-menu cleanup: preserve current/blank selection and all save logic."""
from pathlib import Path
import hashlib
ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
source = (DOCS / 'shared-site-master.js').read_bytes()
index = (DOCS / 'index.html').read_bytes()
assert blob(source) == 'eba22714453236ebd7caf9e2ae4b76c8a400a3ce', 'Site master changed: review instead of overwriting'
assert blob(index) == '061748b1a8a385ca80e11763bdc122b9797c36aa', 'Live index changed: rebase and review'
old = "  const os=options(rows,local(),current,isAdmin(),exclude);"
new = """  // Only the daily report's main site menu: real site names, no selectable prompt.
  // replaceOptions keeps an empty value unselected, never substitutes the first site.
  const os=options(rows,local(),current,isAdmin(),exclude).filter(o=>sel.id!=='site'||o.value!=='');"""
text = source.decode('utf-8')
assert text.count(old) == 1
result = text.replace(old, new)
old_loader = 'shared-site-master.js?v=20260919-hide-placeholders-all-v3'
new_loader = 'shared-site-master.names-only-r1.js?v=20260926-names-only-r1'
html = index.decode('utf-8')
assert html.count(old_loader) == 1
(DOCS / 'shared-site-master.names-only-r1.js').write_text(result, encoding='utf-8')
(DOCS / 'index.html').write_text(html.replace(old_loader, new_loader), encoding='utf-8')
assert (DOCS / 'shared-site-master.js').read_bytes() == source
print('New master SHA256:', hashlib.sha256(result.encode()).hexdigest())
print('New index SHA256:', hashlib.sha256((DOCS / 'index.html').read_bytes()).hexdigest())
