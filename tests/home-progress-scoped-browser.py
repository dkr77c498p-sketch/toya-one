from pathlib import Path
source=Path(__file__).with_name('progress-visible-browser.py').read_text()
# The existing company setup module also creates cmContract. Assert the exact
# home card value, not an arbitrary element with a duplicate global ID.
assert "page.locator('#cmContract')" in source
source=source.replace("page.locator('#cm","page.locator('#companyMonthlySummary #cm")
source=source.replace('document.querySelector("#cmStatus")','document.querySelector("#companyMonthlySummary #cmStatus")')
old="check(page.locator('#companyMonthlySummary #cmNotice').inner_text()!='','previously hidden missing-data notice now visible')"
new="check(page.locator('#companyMonthlySummary #cmNotice').inner_text()!='' and page.locator('#companyMonthlySummary #cmNotice').is_visible(),'previously hidden missing-data notice now visible')"
assert old in source;source=source.replace(old,new,1)
anchor=" for tab in ['homePage','reportPage','recordsPage','attachmentPage','masterPage']:"
stronger=""" page.evaluate('(()=>{const p=document.createElement("p");p.id="cmContract";p.dataset.testDuplicate="true";p.textContent="unrelated-form";document.body.prepend(p)})()')
 click('#cmRefresh');ready()
 check(page.locator('[data-test-duplicate]').inner_text()=='unrelated-form','home refresh does not overwrite duplicate field in another form')
 check(page.locator('#companyMonthlySummary #cmContract').inner_text()=='100,000円','home progress does not depend on document-wide first matching ID')
 page.locator('[data-test-duplicate]').evaluate('(e)=>e.remove()')
"""
assert anchor in source;source=source.replace(anchor,stronger+anchor,1)
exec(compile(source,'progress-visible-browser-scoped','exec'),globals())
