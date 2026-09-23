from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
docs=root/'docs'
def replace_one(s,old,new):
    assert s.count(old)==1,(s.count(old),old[:100])
    return s.replace(old,new,1)
def checked(name,expected):
    data=(docs/name).read_bytes()
    actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    assert actual==expected,(name,actual)
    return data.decode()
# Printed quotation only: leave the recorded formula and any handwritten remarks intact.
s=checked('project-documents-engine.quote5-r2.js','ebcbf3d3af0f4c08ff9df30bbe230a13eb505e45')
s=replace_one(s,"if(formula)return '直接工事費×'+formula[2]+'%';","if(formula)return '';")
s=replace_one(s,'// Shorten only the app-generated overhead formula in the customer printout.','// Omit only the app-generated overhead formula from the customer printout.')
(docs/'project-documents-engine.quote5-r3.js').write_text(s)
# Read-only preview cells, scoped to the quotation editor. Business calculations stay as-is.
s=checked('estimate-plan-admin.quote5-r1.js','4c12e370c8875008759aa2fbb5e0b596b9475145')
helpers=r'''
 // Discount feedback uses the same calculation result as the bottom-of-form totals.
 // The optional before-discount reference runs the existing engine on a new object;
 // it neither changes the quote nor treats a blank/invalid discount as confirmed zero.
 const isDiscountRow=r=>r.discount_input===true||A.chargeKind(r)==='discount';
 const discountPreviewCSS='<style>#epEditor .ep-discount-result{background:#efffcd;border:1px solid #bbd49b;border-radius:10px;padding:9px 7px;line-height:1.3}#epEditor .ep-discount-result small{font-size:11px;color:#2e4614}#epEditor .ep-discount-result strong{font-size:22px;line-height:1.25;margin-top:4px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}#epEditor .ep-discount-breakdown{grid-column:1/-1;font-size:12px;line-height:1.5;color:#4e5749;border-bottom:1px solid #d5ddd3;padding:2px 0 8px}#epEditor .ep-discount-breakdown>div{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}#epEditor .ep-discount-breakdown b{font-weight:600;font-variant-numeric:tabular-nums}#epEditor .ep-discount-status{display:block;color:#985520;font-size:12px;line-height:1.5;margin-top:4px}</style>';
 function quoteAmountCell(r,i,j){
  if(!isDiscountRow(r))return '<div class="ep-quote-amount"><small>見積金額</small><strong data-quote-amount="'+i+','+j+'"></strong></div>';
  return '<div class="ep-quote-amount ep-discount-result" role="status" aria-live="polite" aria-atomic="true"><small>値引き後の合計（税込）</small><strong data-discount-total>未確定</strong></div><div class="ep-discount-breakdown" data-discount-breakdown><div><span>値引き前（税込）</span><b data-discount-before>未確定</b></div><div><span>値引き後・小計（税別）</span><b data-discount-subtotal>未確定</b></div><div><span>消費税</span><b data-discount-tax>未確定</b></div><span class="ep-discount-status" data-discount-status></span></div>';
 }
 function updateDiscountTotals(t,error=''){
  const host=q('#epEditor');if(!host||!host.querySelector('[data-discount-total]'))return;
  const set=(selector,text)=>host.querySelectorAll(selector).forEach(el=>{if(el.textContent!==text)el.textContent=text;});
  let before=null;
  try{
   const reference=C.calculate({...plan,groups:plan.groups.map(g=>({...g,quote_lines:g.quote_lines.filter(r=>!isDiscountRow(r))}))});
   if(reference.complete&&Number.isSafeInteger(reference.total))before=reference.total;
  }catch(_){/* Other invalid lines must not produce an apparently valid reference. */}
  const ready=!error&&t?.complete&&Number.isSafeInteger(t.total);
  set('[data-discount-total]',ready?yen(t.total):'未確定');
  set('[data-discount-subtotal]',ready?yen(t.price):'未確定');
  set('[data-discount-tax]',ready?yen(t.tax):'未確定');
  set('[data-discount-before]',before===null?'未確定':yen(before));
  set('[data-discount-status]',ready?'':error?'入力内容を確認してください。':before!==null?'値引き額を入力すると合計が変わります。':'未入力の明細があります。');
 }
'''
s=replace_one(s,' function simpleRow(r,i,j){',helpers+'\n function simpleRow(r,i,j){')
s=replace_one(s,"host.innerHTML='<section class=\"ep-plan ep-simple\"><ol", "host.innerHTML='<section class=\"ep-plan ep-simple\">'+discountPreviewCSS+'<ol")
old="+'<div class=\"ep-quote-amount\"><small>見積金額</small><strong data-quote-amount=\"'+i+','+j+'\"></strong></div></div><details class=\"ep-row-options\">"
s=replace_one(s,old,"+quoteAmountCell(r,i,j)+'</div><details class=\"ep-row-options\">")
s=replace_one(s,' function updateSimpleTotals(t){\n', ' function updateSimpleTotals(t){\n  updateDiscountTotals(t);\n')
s=replace_one(s,"  }catch(e){q('#epTotals').innerHTML='<p class=\"pb-error\">'+esc(e.message)+'</p>';}","  }catch(e){q('#epTotals').innerHTML='<p class=\"pb-error\">'+esc(e.message)+'</p>';if(plan.entry_mode==='quote')updateDiscountTotals(null,e.message);}")
(docs/'estimate-plan-admin.quote5-r2.js').write_text(s)
s=checked('index.html','71a8ad5342a56e6138aceb83ddb01afe45b0d932')
s=replace_one(s,'project-documents-engine.quote5-r2.js?v=20260923-r2','project-documents-engine.quote5-r3.js?v=20260923-r3')
s=replace_one(s,'estimate-plan-admin.quote5-r1.js?v=20260923-r1','estimate-plan-admin.quote5-r2.js?v=20260923-discount-r2')
(docs/'index.html').write_text(s)
print('Quote display only: generated print formula removed; live discount total adjacent. No calculation, auth, report or data changes.')
