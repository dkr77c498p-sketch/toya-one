(()=>{'use strict';
const q=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ok=()=>typeof cloudProfile!=='undefined'&&cloudProfile?.active&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined';
let busy=false;
async function load(){const box=q('#inventoryList');if(!box||!ok()||busy)return;busy=true;try{
 const company=cloudProfile.company_id,[ir,mr,sr]=await Promise.all([
  cloudClient.from('inventory_items').select('*').eq('company_id',company).eq('active',true).order('supplier').order('name'),
  cloudClient.from('inventory_movements').select('item_id,movement_type,qty').eq('company_id',company),
  cloudClient.from('sites').select('id,name').eq('company_id',company).eq('status','active').order('name')]);
 if(ir.error||mr.error||sr.error)throw(ir.error||mr.error||sr.error);
 const moves=mr.data||[],sites=sr.data||[];
 box.innerHTML=(ir.data||[]).map(item=>{let stock=Number(item.opening_qty)||0;moves.filter(m=>m.item_id===item.id).forEach(m=>stock+=(m.movement_type==='in'?1:m.movement_type==='use'?-1:0)*Number(m.qty||0));
 return '<div style="border-top:1px solid #ddd;padding:12px 0"><b>'+esc(item.supplier)+'｜'+esc(item.name)+'</b><div style="font-size:24px;font-weight:900;margin:6px 0">'+stock.toLocaleString('ja-JP')+esc(item.unit)+'</div><div class="grid2"><button class="btn light" data-inv-use="'+item.id+'">－ 使用</button><button class="btn light" data-inv-in="'+item.id+'">＋ 入庫</button></div></div>';}).join('');
 box.onclick=async e=>{const b=e.target.closest('[data-inv-use],[data-inv-in]');if(!b)return;const type=b.dataset.invUse?'use':'in',id=b.dataset.invUse||b.dataset.invIn,item=(ir.data||[]).find(x=>x.id===id);const raw=prompt((type==='use'?'使用量':'入庫量')+'（'+item.unit+'）');if(raw===null)return;const qty=Number(raw);if(!Number.isFinite(qty)||qty<=0)return alert('0より大きい数量を入力してください。');let site_id=null;if(type==='use'&&sites.length){const names=sites.map((s,i)=>(i+1)+'：'+s.name).join('\n'),pick=prompt('使用した現場番号（任意）\n'+names);if(pick){const s=sites[Number(pick)-1];if(s)site_id=s.id;}}const r=await cloudClient.from('inventory_movements').insert({company_id:company,item_id:id,movement_date:new Date().toLocaleDateString('sv-SE'),movement_type:type,qty,site_id,created_by:cloudProfile.id,note:type==='use'?'TOYA One 使用登録':'TOYA One 入庫'});if(r.error)return alert('保存できませんでした：'+r.error.message);busy=false;load();};
 }catch(e){box.textContent='在庫を読み込めませんでした：'+e.message;}finally{busy=false;}}
document.addEventListener('toya-role-changed',load);document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page="homePage"]'))setTimeout(load,100);});setInterval(()=>{if(q('#homePage')?.classList.contains('active'))load();},60000);setTimeout(load,1000);
})();