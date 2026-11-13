"""Apply the reviewed UTF-8 source delta, never business data or credentials.
The transport is compressed JSON; tested human-readable sources are staged before review.
"""
from pathlib import Path
import base64,hashlib,json,zlib
root=Path(__file__).resolve().parents[1]
transport=''.join((root/f'staging/monthly-profit/payload-{i}.b64').read_text().strip() for i in range(1,4))
assert len(transport)==18044,'Source transfer length differs'
raw=zlib.decompress(base64.b64decode(transport,validate=True))
assert hashlib.sha256(raw).hexdigest()=='65836cb7d044b7ca3c93ab688968421f65dfb0f1d29d7b658d515eeb520c1954','Unapproved source transport'
package=json.loads(raw)
expected={'docs/company-monthly-summary.profit-r2.js','docs/site-period-ledger.profit-r2.js','docs/site-period-ledger-ui.profit-r2.js','docs/index.html','docs/work-month-revenue.r1.js','tests/monthly-profit.cjs','tests/monthly-profit-browser.py'}
assert package['version']==1 and set(package['outputs'])==expected
staged={}
for name,item in package['outputs'].items():
    path=root/name
    assert path.resolve().is_relative_to(root)
    if 'text' in item:
        content=item['text']
    else:
        original=root/item['base']
        assert original.resolve().is_relative_to(root/'docs')
        source=original.read_bytes()
        assert hashlib.sha256(source).hexdigest()==item['base_sha256'],f'Base changed: {item["base"]}'
        lines=source.decode('utf-8').splitlines(keepends=True)
        for start,end,text in reversed(item['edits']):
            assert 0<=start<=end<=len(lines)
            lines[start:end]=text.splitlines(keepends=True)
        content=''.join(lines)
    data=content.encode('utf-8')
    assert hashlib.sha256(data).hexdigest()==item['sha256'],f'Output differs: {name}'
    staged[path]=data
# All hashes pass before any application file is written.
for path,data in staged.items():
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(data)
    print(path.relative_to(root),hashlib.sha256(data).hexdigest())
