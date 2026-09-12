'use strict';
const assert=require('node:assert/strict');
const E=require('../docs/project-documents-engine.js');
const {setup,pause}=require('./project-business-ui.cjs');

(async()=>{
 for(const kind of ['invoice','progress','estimate']){
  const s=await setup('admin'),w=s.w,q=sel=>w.document.querySelector(sel),observers=[];
  // Include the window-resize fallback used by browsers without ResizeObserver.
  if(kind!=='progress')w.ResizeObserver=class{
   constructor(callback){this.callback=callback;this.targets=new Set();observers.push(this);}
   observe(target){this.targets.add(target);}unobserve(target){this.targets.delete(target);}
   disconnect(){this.targets.clear();this.disconnected=true;}
  };
  if(kind==='estimate'){
   await w.ToyaProjectBusiness.openEstimate({...E.draft('estimate',{id:null,name:'新規見積の試験'},s.db.billing_profiles[0],'2026-09-12'),customer_name:'テスト宛先',items:[{name:'解体工事',quantity:'1',unit:'式',unitPrice:'200000',costPrice:null}]});
  }else{
   q('#pbSite').value='site-1';q('#pbSite').dispatchEvent(new w.Event('change'));await pause();
   q('[data-pb-kind="'+kind+'"]').click();q('#pbNew').click();
   for(const [sel,value] of [['#pbCustomer','テスト宛先'],[kind==='progress'?'#pbCumulative':'#pbPrice0',kind==='progress'?'50000':'200000']]){
    q(sel).value=value;q(sel).dispatchEvent(new w.Event('input',{bubbles:true}));
   }
  }
  const saved=JSON.stringify(s.db.project_documents);
  q('#pbShowPreview').focus();q('#pbShowPreview').click();
  const frame=q('#pbPreview iframe'),viewport=q('.pb-preview-viewport'),stage=q('.pb-preview-stage');
  // JSDOM does not load srcdoc or lay out physical units. Supply only those
  // browser measurements; exercise the real preview events and print handler.
  const inner=frame.contentDocument;inner.open();inner.write(frame.srcdoc);inner.close();
  const body=inner.body,paper=inner.querySelector('.invoice-document,.te2-page');
  assert.ok(paper);
  const original=inner.documentElement.outerHTML,css=frame.contentWindow.getComputedStyle.bind(frame.contentWindow);
  const fullWidth=kind==='estimate'?810:758;
  frame.contentWindow.getComputedStyle=node=>node===body?{paddingLeft:kind==='estimate'?'8px':'12px',paddingRight:kind==='estimate'?'8px':'12px',minWidth:kind==='estimate'?'794px':'758px'}:node===paper?{width:kind==='estimate'?'793.7px':'733.23px'}:css(node);
  let available=320,height=kind==='estimate'?8000:1200;
  Object.defineProperty(viewport,'clientWidth',{get:()=>available});
  Object.defineProperty(body,'scrollHeight',{get:()=>height});
  body.getBoundingClientRect=()=>({height:height-.25});
  frame.dispatchEvent(new w.Event('load'));
  for(const width of [320,393,768,1024,393,320]){
   available=width;w.dispatchEvent(new w.Event('resize'));
   const scale=Math.min(1,width/fullWidth);
   assert.equal(parseFloat(frame.style.width),fullWidth,'the document viewport never narrows on a phone');
   assert.equal(parseFloat(frame.style.height),height,'all pages stay inside the unscaled frame');
   assert.equal(frame.style.transform,'scale('+scale+')');
   assert.ok(parseFloat(stage.style.width)<=available,'the complete paper fits in the visible width');
   assert.ok(parseFloat(stage.style.height)>=height*scale,'the final total/page remains scrollable');
   assert.equal(inner.documentElement.outerHTML,original,'resizing cannot reformat text or change print CSS');
  }
  // A late layout change (e.g. font loading) must include the new last page.
  height+=500;
  if(observers.length){
   assert.ok(observers[0].targets.has(body));observers[0].callback();
  }else w.dispatchEvent(new w.Event('resize'));
  assert.equal(parseFloat(frame.style.height),height);
  assert.equal(parseFloat(stage.style.height),Math.ceil(height*Math.min(1,available/fullWidth)));
  let prints=0;frame.contentWindow.focus=()=>{};
  frame.contentWindow.print=()=>{prints++;assert.equal(inner.documentElement.outerHTML,original);};
  q('#pbPrint').click();assert.equal(prints,1,'print the original A4 document, not the scaled outer page');
  const oldStyle=frame.getAttribute('style');
  q('#pbPreview').dispatchEvent(new w.Event('cancel',{cancelable:true}));
  assert.equal(q('#pbPreview'),null);assert.equal(w.document.activeElement,q('#pbShowPreview'));
  available=700;w.dispatchEvent(new w.Event('resize'));await pause();
  assert.equal(frame.getAttribute('style'),oldStyle,'closed previews must stop handling resizes');
  assert.ok(observers.every(o=>o.disconnected));
  q('#pbShowPreview').click();q('#pbShowPreview').click();
  assert.equal(w.document.querySelectorAll('#pbPreview').length,1);
  w.cloudProfile=null;w.applyCloudRoleUI();
  assert.equal(q('#pbPreview'),null);assert.ok(observers.every(o=>o.disconnected));
  assert.equal(JSON.stringify(s.db.project_documents),saved,'preview/print never saves or issues a document');
  assert.equal(s.calls.filter(([name])=>name==='toya_issue_project_document').length,0);
  s.dom.window.close();
  console.log('PASS '+kind+': fixed paper viewport, proportional scaling, full height, A4 print and preview cleanup');
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
