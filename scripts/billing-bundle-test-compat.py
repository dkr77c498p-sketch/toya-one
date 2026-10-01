from pathlib import Path
import hashlib
p=Path('tests/billing-bundle-browser.py');s=p.read_text()
assert hashlib.sha256(s.encode()).hexdigest()=='1df5c18c2278a63b14424e9b7b7ca5bba758dbabfc0b63003781b36fcf30ba1c'
f="page.locator('#bbMonth').dispatch_event('change');page.wait_for_timeout(150)"
r="page.locator('#bbMonth').dispatch_event('change');page.locator('#bbMonth').evaluate('(e)=>e.blur()');page.wait_for_timeout(150)"
assert s.count(f)==1;s=s.replace(f,r)
f=' # Source version changes cannot silently export stale data.\n'
r=''' # Native month controls must commit/blur before the synthetic click helper.
 # Preserve the same selected source IDs after closing an exported PDF.
 print('before source refresh:',page.evaluate("""()=>({status:document.querySelector('#bbStatus').textContent,previewDisabled:document.querySelector('#bbPreview').disabled,selected:[...document.querySelectorAll('[data-bb-id]:checked')].map(x=>x.dataset.bbId),month:document.querySelector('#bbMonth').value,active:document.activeElement?.id})"""),flush=True)
 check(page.locator('[data-bb-id="a"]').is_checked() and page.locator('[data-bb-id="b"]').is_checked(),'closing a generated PDF preserves selected sources')
 # Source version changes cannot silently export stale data.
'''
assert s.count(f)==1;s=s.replace(f,r)
f='page.wait_for_function(\'document.querySelector("#bbStatus").textContent.includes("更新されました")\')'
r='''page.wait_for_timeout(200)
 print('source refresh state:',page.evaluate("""()=>({status:document.querySelector('#bbStatus').textContent,previewDisabled:document.querySelector('#bbPreview').disabled,selected:[...document.querySelectorAll('[data-bb-id]:checked')].map(x=>x.dataset.bbId),dialog:!!document.querySelector('#bbPreviewDialog')})"""),'errors:',errors,flush=True)
 page.wait_for_function('document.querySelector("#bbStatus").textContent.includes("更新されました")')'''
assert s.count(f)==1;s=s.replace(f,r)
assert hashlib.sha256(s.encode()).hexdigest()=='42954fa6779afca10afa95329c5886712d619cf65b67817b572abeb2a7afeb3f'
p.write_text(s)
