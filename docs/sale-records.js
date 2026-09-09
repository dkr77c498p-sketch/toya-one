/* TOYA One sale records: quantity/destination only. No accounting or database writes. */
(() => {
  'use strict';
  const prefix='売却記録：', list=v=>Array.isArray(v)?v:[];
  const isRecordOnly=x=>x?.costTreatment==='record_only_sale'||String(x?.name||'').startsWith(prefix);
  const label=x=>String(x?.name||'').replace(/^売却記録：/,'').replace(/^産廃：/,'');
  const engine=Object.freeze({isRecordOnly,label});
  if(typeof module==='object'&&module.exports){module.exports=engine;return;}
  if(window.ToyaSaleRecordEngine)return;
  window.ToyaSaleRecordEngine=engine;
  const q=(s,r=document)=>r.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function paint(row){
    const yes=q('.sr-only',row)?.checked,price=q('.i-price',row),input=q('.i-name',row);
    if(!price||!input)return;
    let s=input.value;
    if(yes&&!s.startsWith(prefix))input.value=prefix+s;
    if(!yes&&s.startsWith(prefix))input.value=s.slice(prefix.length);
    const holder=price.closest('.stepper')?.parentElement||price.parentElement;
    if(holder)holder.hidden=!!yes;
    q('.sr-note',row).textContent=yes?'売却先・品目・数量だけを保存。金額は原価・売上のどちらにも加算しません。元の産廃・マニフェスト属性は変更しません。':'';
  }
  function decorate(row,d={}){
    if(!row||q('.sr-only',row)||String(d.name||q('.i-name',row)?.value||'').startsWith('重機回送：'))return;
    const p=document.createElement('div');p.className='sr-option';
    p.innerHTML='<label class="choice"><input type="checkbox" class="sr-only" '+(isRecordOnly(d)?'checked':'')+'>売却・記録のみ（金額集計しない）</label><p class="note sr-note"></p>';
    row.appendChild(p);q('.sr-only',row).addEventListener('change',()=>paint(row));q('.i-name',row)?.addEventListener('change',()=>paint(row));
    // Preserve historical amounts invisibly; toggling the treatment does not erase source data.
    if(isRecordOnly(d)&&d.price!==undefined)q('.i-price',row).value=d.price;
    paint(row);
  }
  let installed=false;
  function install(){
    if(installed||typeof window.addItem!=='function'||typeof window.collect!=='function')return;
    installed=true;
    const originalAdd=window.addItem;
    window.addItem=function(d={}){const out=originalAdd.apply(this,arguments);decorate(q('#items .item:last-child'),d);return out;};
    Object.assign(window.addItem,originalAdd);
    q('#items')?.querySelectorAll('.item').forEach(r=>decorate(r,{name:q('.i-name',r)?.value}));
    const old=window.collect;
    window.collect=function(){const d=old.apply(this,arguments);d.items=list(d.items).map(x=>isRecordOnly(x)?{...x,costTreatment:'record_only_sale'}:x);return d;};
    const oldText=window.lineText;
    window.lineText=function(d){const sales=list(d.items).filter(isRecordOnly),copy={...d,items:list(d.items).filter(x=>!isRecordOnly(x))};let out=oldText.call(this,copy);if(sales.length)out+='\n\n■金属売却の記録（金額は集計しない）\n'+sales.map(x=>'・'+label(x)+' '+(x.qty||'数量未入力')+(x.unit||'')+(x.company?'／売却先 '+x.company:'')).join('\n');return out;};
    const c=document.createElement('div');c.className='card';c.id='saleRecordCard';
    c.innerHTML='<h2>金属売却の記録（金額なし）</h2><p class="note">売却先・種類・数量を残します。処分費・売上・原価には加算しません。</p><label>売却先</label><input id="srBuyer" placeholder="例：金属買取会社" maxlength="120"><label>品目</label><select id="srType"><option>金属くず</option><option>アルミ</option><option>鉄</option><option>銅</option><option>その他</option></select><label>数量</label><input id="srQty" data-stepper="1" type="number" inputmode="decimal" min="0" step="0.01" placeholder="実際の数量"><label>単位</label><select id="srUnit"><option>台</option><option>kg</option><option>t</option><option>m³</option></select><label>車両・メモ（任意）</label><input id="srNote" placeholder="例：3tダンプ1台" maxlength="200"><button id="srAdd" class="btn dark" type="button" style="width:100%;margin-top:12px">＋ 売却記録を日報へ追加</button>';
    const anchor=q('#items')?.closest('.card');if(anchor)anchor.before(c);
    q('#srAdd')?.addEventListener('click',()=>{const qty=Number(q('#srQty').value),buyer=q('#srBuyer').value.trim();if(!buyer||!Number.isFinite(qty)||qty<=0){alert('売却先と数量を入力してください。');return;}const memo=q('#srNote').value.trim();window.addItem({name:esc(prefix+q('#srType').value+(memo?'（'+memo+'）':'')),qty,unit:q('#srUnit').value,price:'',company:esc(buyer),isWaste:false,costTreatment:'record_only_sale'});q('#items .item:last-child')?.scrollIntoView({behavior:'smooth',block:'center'});});
    const clear=window.clearReportFormDynamic;
    if(typeof clear==='function')window.clearReportFormDynamic=function(){const out=clear.apply(this,arguments);['srBuyer','srQty','srNote'].forEach(id=>{if(q('#'+id))q('#'+id).value='';});return out;};
  }
  function start(){install();let n=0;const t=setInterval(()=>{install();if(installed||++n>20)clearInterval(t);},250);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
