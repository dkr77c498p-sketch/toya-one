/* Quote export only. No account/database writes, automatic sharing or external upload.
 * Render pre-paginated quote sheets locally, one canvas at a time (192 dpi).
 * The resulting PDF is image-based; the existing browser print path is retained.
 */
(function(root){
 'use strict';
 if(root.ToyaQuotePDF)return;
 const FILE_NAME='TOYAONE.pdf',TITLE='TOYAONE';
 const source=document.currentScript?.src||new URL('quote-pdf-export.r1.js',document.baseURI).href;
 const assets=new URL('.',source);
 let dependencies=null;
 function wait(p,ms,message){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(message)),ms);Promise.resolve(p).then(x=>{clearTimeout(t);resolve(x);},e=>{clearTimeout(t);reject(e);});});}
 function script(name,check){
  if(check())return Promise.resolve();
  return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('vendor/'+name,assets).href;s.async=true;s.onload=()=>check()?resolve():reject(Error('PDF作成用のプログラムを確認できません。'));s.onerror=()=>{s.remove();reject(Error('PDF作成用のプログラムを読み込めません。通信を確認して再度お試しください。'));};document.head.append(s);});
 }
 function libraries(){
  if(!dependencies)dependencies=wait(Promise.all([script('html2canvas-1.4.1.min.js',()=>typeof root.html2canvas==='function'),script('pdf-lib-1.17.1.min.js',()=>!!root.PDFLib?.PDFDocument)]),30000,'PDF作成用の読込が時間切れになりました。').catch(e=>{dependencies=null;throw e;});
  return dependencies;
 }
 const captureCSS='html,body{margin:0!important;padding:0!important;min-width:0!important;width:210mm!important;background:#fff!important;zoom:1!important;transform:none!important;-webkit-text-size-adjust:100%!important}body>.te2-page{margin:0!important;box-shadow:none!important}';
 function preparedHTML(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  if(!doc.querySelector('.te2-page'))throw Error('見積書のページを確認できません。');
  if(doc.querySelector('script,iframe,object,embed,link[rel="stylesheet"]'))throw Error('PDF用の書式を確認してください。');
  doc.querySelectorAll('base').forEach(x=>x.remove());
  // Only the existing same-origin company logo is used; no arbitrary remote images.
  for(const img of doc.images){const url=new URL(img.getAttribute('src')||'',assets);if(url.origin!==assets.origin||url.pathname!==new URL('toya-document-logo.svg',assets).pathname)throw Error('PDFの画像の読込先を確認してください。');img.src=url.href;img.removeAttribute('srcset');}
  const base=doc.createElement('base');base.href=assets.href;doc.head.prepend(base);
  const style=doc.createElement('style');style.textContent=captureCSS;doc.head.append(style);doc.title=TITLE;
  return '<!doctype html>'+doc.documentElement.outerHTML;
 }
 async function build(html,options={}){
  const valid=options.isCurrent||(()=>true),progress=options.onProgress||(()=>{});
  const check=()=>{if(!valid())throw new DOMException('画面が閉じられたか、ログインが切り替わりました。','AbortError');};
  check();const prepared=preparedHTML(html);await libraries();check();
  const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-same-origin');frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.dataset.toyaPdfCapture='1';
  frame.style.cssText='position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0;pointer-events:none;';
  const loaded=new Promise((resolve,reject)=>{frame.onload=resolve;frame.onerror=()=>reject(Error('見積書の描画に失敗しました。'));});
  frame.srcdoc=prepared;(options.container||document.body).append(frame);
  let canvas=null;
  try{
   await wait(loaded,15000,'見積書の読込が時間切れになりました。');check();
   const doc=frame.contentDocument;
   if(!doc?.body)throw Error('見積書を読み込めませんでした。');
   await wait(doc.fonts?.ready||Promise.resolve(),15000,'文字の準備が時間切れになりました。');check();
   await wait(Promise.all([...doc.images].map(async image=>{if(image.decode)await image.decode();else if(!image.complete)await new Promise((r,j)=>{image.onload=r;image.onerror=j;});if(!image.naturalWidth)throw Error('会社ロゴを読み込めませんでした。');})),15000,'会社ロゴを読み込めませんでした。');check();
   const pages=[...doc.body.querySelectorAll(':scope > .te2-page')];
   if(!pages.length||pages.length>60)throw Error('PDFのページ数を確認してください（最大60枚）。');
   const pdf=await root.PDFLib.PDFDocument.create();pdf.setTitle(TITLE);pdf.setCreator(TITLE);pdf.setProducer(TITLE);
   for(let index=0;index<pages.length;index++){
    check();progress(index+1,pages.length);
    const paper=pages[index],box=paper.getBoundingClientRect();
    if(box.width<790||box.width>800||box.height<1100||box.height>1130)throw Error((index+1)+'ページ目がA4枠からはみ出しています。PDFは作成していません。');
    // Overflow must not be silently clipped. Typical fixed-width quote fields
    // and tables are checked against their page before rasterization.
    for(const el of paper.querySelectorAll('table,.te2-frame,.te2-cover-brand')){const b=el.getBoundingClientRect();if(b.bottom>box.bottom+2||b.right>box.right+2||b.left<box.left-2)throw Error((index+1)+'ページ目の文字や表の位置を確認してください。');}
    canvas=await root.html2canvas(paper,{scale:2,backgroundColor:'#ffffff',logging:false,allowTaint:false,useCORS:false,imageTimeout:15000,scrollX:0,scrollY:0,windowWidth:794,windowHeight:1123,width:Math.ceil(box.width),height:Math.ceil(box.height)});check();
    if(!canvas.width||!canvas.height||canvas.width*canvas.height>4000000)throw Error('PDFの画像サイズを確認できません。');
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(x=>x?resolve(x):reject(Error('PDFのページ画像を作成できません。')),'image/png'));check();
    canvas.width=canvas.height=1;canvas=null;
    const image=await pdf.embedPng(await blob.arrayBuffer());check();
    pdf.addPage([595.275590551,841.88976378]).drawImage(image,{x:0,y:0,width:595.275590551,height:841.88976378});
    await pdf.flush();check();await new Promise(r=>setTimeout(r,0));
   }
   const bytes=await pdf.save();check();
   return {file:new File([bytes],FILE_NAME,{type:'application/pdf'}),pages:pages.length};
  }finally{if(canvas)canvas.width=canvas.height=1;frame.remove();}
 }
 function mount({dialog,button,html,isCurrent}){
  let disposed=false,busy=false,file=null,url=null;
  const valid=()=>!disposed&&dialog.isConnected&&dialog.open&&isCurrent();
  const panel=document.createElement('div');panel.className='toya-pdf-actions';panel.style.cssText='padding:10px 0;';panel.innerHTML='<p role="status" aria-live="polite" style="margin:0 0 8px;font-size:14px"></p><div hidden><button type="button" class="btn lime" data-pdf-share>共有・ファイルに保存</button> <a class="btn light" data-pdf-download download="TOYAONE.pdf" style="display:inline-block;text-decoration:none;color:inherit">PDFを保存</a></div>';
  dialog.querySelector('.pb-preview-viewport').before(panel);
  const status=panel.querySelector('p'),actions=panel.querySelector('div'),share=panel.querySelector('[data-pdf-share]'),download=panel.querySelector('[data-pdf-download]');
  const release=()=>{if(url)URL.revokeObjectURL(url);url=null;file=null;download.removeAttribute('href');actions.hidden=true;};
  function sharePDF(){
   if(!valid()||!file){release();status.textContent='同じ見積を開き直してください。';return;}
   // A separate explicit tap retains iOS transient user activation. Do not
   // invoke native sharing automatically after slow asynchronous PDF rendering.
   if(root.navigator.share&&root.navigator.canShare?.({files:[file]})){
    share.disabled=true;
    root.navigator.share({files:[file],title:TITLE}).then(()=>{if(valid())status.textContent='共有先への引き渡しを終了しました。送信結果は共有先で確認してください。';}).catch(e=>{if(valid())status.textContent=e.name==='AbortError'?'共有をキャンセルしました。PDFはもう一度共有できます。':'共有できませんでした。「PDFを保存」から端末に保存してください。';}).finally(()=>{if(!disposed)share.disabled=false;});
   }else download.click();
  }
  share.onclick=sharePDF;
  download.onclick=e=>{if(!valid()||!file){e.preventDefault();release();status.textContent='同じ見積を開き直してください。';}};
  button.onclick=async()=>{
   if(busy)return;if(file)return sharePDF();if(!valid())return;
   busy=true;button.disabled=true;status.textContent='PDFを準備しています…';
   try{
    const result=await build(html,{isCurrent:valid,container:dialog,onProgress:(n,total)=>{if(valid()){status.textContent='PDF作成中 '+n+' / '+total+'ページ';button.textContent='PDF作成中…';}}});
    if(!valid())return;file=result.file;url=URL.createObjectURL(file);download.href=url;download.download=FILE_NAME;actions.hidden=false;
    share.hidden=!(root.navigator.share&&root.navigator.canShare?.({files:[file]}));
    status.textContent=FILE_NAME+'（'+result.pages+'ページ）を作成しました。共有または保存を選んでください。';button.textContent='PDFを共有・保存';
   }catch(e){release();if(valid()){status.textContent='PDFを作成できませんでした：'+(e.message||e);button.textContent='PDFを作り直す';}}
   finally{busy=false;if(!disposed)button.disabled=false;}
  };
  return {dispose(){disposed=true;release();button.onclick=null;panel.remove();}};
 }
 root.ToyaQuotePDF=Object.freeze({FILE_NAME,TITLE,build,mount});
})(window);
