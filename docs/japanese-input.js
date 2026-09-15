/* Keep Japanese conversion intact until the browser commits the text. */
(() => {
 'use strict';
 const bindings=new WeakMap();
 window.ToyaJapaneseInput={bind(host,changed,notice){
  bindings.get(host)?.();
  let composing=null;
  const start=e=>{composing=e.target;};
  const update=e=>{if(e.isComposing||composing)return;changed(e);};
  const end=e=>{composing=null;changed(e);};
  const click=e=>{
   if(!composing||!e.target.closest('button'))return;
   e.preventDefault();e.stopImmediatePropagation();
   notice('文字の変換を確定してから、もう一度押してください。',true);
  };
  host.addEventListener('compositionstart',start);
  host.addEventListener('compositionend',end);
  host.addEventListener('input',update);
  host.addEventListener('change',update);
  host.addEventListener('click',click,true);
  bindings.set(host,()=>{
   host.removeEventListener('compositionstart',start);host.removeEventListener('compositionend',end);
   host.removeEventListener('input',update);host.removeEventListener('change',update);host.removeEventListener('click',click,true);
  });
 }};
})();
