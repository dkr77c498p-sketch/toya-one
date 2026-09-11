const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const E=require('../docs/project-documents-engine.js');
const {setup,pause}=require('./project-business-ui.cjs');
const base={...E.draft('invoice',{id:'site-1',name:'テスト解体工事'},
 {issuer_name:'テスト工業',postal_code:'000-0000',address:'テスト市',phone:'000-0000-0000',fax:'000-0000-0001',representative:'代表者 テスト',logo_key:'toya',bank_details:'テスト銀行\n普通 0000000'},'2026-09-11'),
 customer_name:'テスト建設',customer_address:'000-0000\nテスト町',due_date:'2026-10-31',
 items:[{name:'解体工事',quantity:'1',unit:'式',unitPrice:'1710000',code:'工事番号42-307',remark:'確認済み'},
 {name:'運搬処分',quantity:'1',unit:'式',unitPrice:'3850000'},
 {name:'付帯工事',quantity:'1',unit:'式',unitPrice:'800000'}]};
const read=d=>{const doc=new JSDOM(E.printHTML(d).replace(/<style>[\s\S]*?<\/style>/,''));return {dom:doc,q:s=>doc.window.document.querySelector(s)}};
(async()=>{
 const {dom,q}=read(base);
 assert.equal(q('.invoice-grand strong').textContent,'6,996,000');
 assert.equal(q('.invoice-lines thead').textContent,'納品コード／商品名数量単位単価金額備考');
 assert.equal(q('.invoice-lines tbody').children.length,20);
 assert.equal(q('.invoice-item td:nth-child(4)').textContent,'');
 assert.equal(q('.invoice-item td:nth-child(5)').textContent,'1,710,000');
 assert.equal(q('.invoice-item td:nth-child(6)').textContent,'確認済み');
 assert.match(q('.invoice-item td:first-child').textContent,/工事番号42-307/);
 assert.match(q('.invoice-sender').textContent,/代表者 テスト/);
 assert.match(q('.invoice-sender').textContent,/FAX 000-0000-0001/);
 assert.equal(q('.invoice-logo').getAttribute('src'),'toya-document-logo.svg');
 assert.equal(q('.invoice-totals').textContent,'税抜額6,360,000消費税額636,000合計6,996,000');
 assert.equal(q('.invoice-state').textContent,'下書き');
 assert.match(q('.invoice-terms').textContent,/2026-10-31/);dom.window.close();
 const before=JSON.stringify(base);E.printHTML(base);assert.equal(JSON.stringify(base),before);
 const escaped=read({...base,issuer:{issuer_name:'別会社'},items:[{name:'<script>bad()</script>',spec:'<img src=x>',code:'<b>code</b>',remark:'<svg onload=x>',quantity:'2.125',unit:'m²',unitPrice:'100.25'}]});
 assert.equal(escaped.q('script'),null);assert.equal(escaped.q('img'),null);assert.equal(escaped.q('.invoice-logo'),null);assert.equal(escaped.q('.invoice-item td:nth-child(4)').textContent,'100.25');assert.equal(escaped.q('.invoice-item td:nth-child(5)').textContent,'213');escaped.dom.window.close();
 const p=read({...base,kind:'progress',contract_amount:100000,cumulative_amount:70000,previous_billed:20000,items:[{name:'出来高分',quantity:'1',unit:'式',unitPrice:'50000'}]});
 assert.equal(p.q('h1').textContent,'出来高請求書');assert.match(p.q('.invoice-progress').textContent,/前回までの請求額（税別）20,000今回請求額（税別）50,000/);assert.equal(p.q('.invoice-grand strong').textContent,'55,000');p.dom.window.close();
 for(const tax_rate of [0,8]){const d=read({...base,tax_rate});assert.match(d.q('.invoice-tax-detail').textContent,tax_rate===0?/非課税・対象外/:/軽減税率/);d.dom.window.close();}
 const many=read({...base,items:Array.from({length:48},(_,i)=>({name:'明細'+i,quantity:'1',unit:'式',unitPrice:'1000'}))});assert.equal(many.q('.invoice-lines tbody').children.length,48);assert.equal(many.dom.window.document.querySelectorAll('.invoice-totals').length,1);many.dom.window.close();
 assert.ok(!E.printHTML({...base,kind:'estimate'}).includes('invoice-document'));
 const issued=read({...base,status:'issued',document_number:'INV-TEST-0001'});assert.equal(issued.q('.invoice-state'),null);assert.match(issued.q('.invoice-meta').textContent,/INV-TEST-0001/);issued.dom.window.close();
 console.log('PASS invoice columns, amounts, company header, safety, tax, progress and multi-page structure');
 const ui=await setup('admin'),w=ui.w,find=s=>w.document.querySelector(s),put=(s,v)=>{find(s).value=v;find(s).dispatchEvent(new w.Event('input',{bubbles:true}));};
 put('#pbIssuerPostal','1234567');put('#pbIssuerFax','000-1111-2222');put('#pbIssuerRepresentative','代表取締役 テスト');put('#pbIssuerLogo','toya');find('#pbCompanySave').click();await pause();
 assert.equal(ui.db.billing_profiles[0].postal_code,'123-4567');assert.equal(ui.db.billing_profiles[0].logo_key,'toya');
 find('#pbSite').value='site-1';find('#pbSite').dispatchEvent(new w.Event('change'));await pause();find('#pbNew').click();
 assert.match(find('#pbIssuerView').textContent,/FAX 000-1111-2222/);put('#pbCustomer','試験請求先');put('#pbDueDate','2026-10-31');put('#pbCode0','工事番号001');put('#pbRemark0','完了分');find('#pbSaveDoc').click();await pause();
 const saved=ui.db.project_documents[0];assert.equal(saved.items[0].code,'工事番号001');assert.equal(saved.items[0].remark,'完了分');assert.equal(saved.issuer.representative,'代表取締役 テスト');
 find('#pbCloseEditor').click();find('[data-pb-open="'+saved.id+'"]').click();assert.equal(find('#pbCode0').value,'工事番号001');assert.equal(find('#pbRemark0').value,'完了分');
 find('#pbShowPreview').click();assert.match(find('#pbPreview iframe').srcdoc,/invoice-document/);assert.match(find('#pbPreview iframe').srcdoc,/完了分/);assert.match(find('#pbPreview .note').textContent,/下書きを保存.*内容を確定・採番/);assert.equal(ui.db.project_documents[0].status,'draft');find('#pbPreviewClose').click();
 put('#pbIssuerFax','000-9999-9999');find('#pbCompanySave').click();await pause();assert.equal(ui.db.project_documents[0].issuer.fax,'000-1111-2222');
 put('#pbIssuerPostal','123');find('#pbCompanySave').click();await pause();assert.equal(ui.db.billing_profiles[0].postal_code,'123-4567');
 w.cloudProfile=null;w.applyCloudRoleUI();assert.equal(find('#projectBusinessCard'),null);ui.dom.window.close();
 console.log('PASS issuer fields save, document snapshots, invoice remarks round trip and logout');
})().catch(e=>{console.error(e);process.exitCode=1});
