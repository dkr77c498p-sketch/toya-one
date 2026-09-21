/* TOYA One: stable company monthly total card */
(() => {
'use strict';
const q=s=>document.querySelector(s);
const yen=n=>n==null?'—':Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円';
const monthNow=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,7);
const clean=s=>String(s||'').normalize('NFKC').replace(/[\s　]/g,'');
const isInternal=name=>clean(name)==='会社の清掃(犬迫町)';
let card=null,busy=false,lastKey='';
function ready(){return typeof cloudProfile!=='undefined'&&cloudProfile?.active===true&&cloudProfile.role==='admin'&&cloudProfile.company_id&&typeof cloudClient!=='undefined'&&cloudClient;}
function mount(){
 const home=q('#homePage'); if(!home||!ready()) return false;
 if(card?.isConnected) return true;
 card=document.createElement('section'); card.id='toyaCompanyTotalStable'; card.className='card admin-home-only';
 card.style.borderTop='5px solid var(--lime,#b8ff00)';
 card.innerHTML='<h2>会社全体・月間合計</h2><div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;margin-bottom:12px"><div><label for="tctsMonth">対象月</label><input id="tctsMonth" type="month" value="'+monthNow()+'"></div><button id="tctsRefresh" class="btn dark" type="button">更新</button></div><div class="statgrid"><div class="stat"><b id="tctsContract">—</b><span>請負金合計</span></div><div class="stat"><b id="tctsProgress">—</b><span>出来高合計</span></div><div class="stat"><b id="tctsCost">—</b><span>原価合計</span></div><div class="stat"><b id="tctsProfit">—</b><span>利益合計</span></div></div><p id="tctsNote" class="note" style="margin-top:10px">読み込み中…</p>';
 const anchor=q('#pbHomeActions')||q('#uxDailyHome')||q('#cloudCard'); if(anchor)anchor.after(card); else home.prepend(card);
 q('#tctsRefresh').onclick=load; q('#tctsMonth').onchange=load; load(); return true;
}
async function all(table,fields,company){
 const out=[]; for(let from=0;from<100000;from+=500){const r=await cloudClient.from(table).select(fields).eq('company_id',company).range(from,from+499);if(r.error)throw r.error;out.push(...(r.data||[]));if((r.data||[]).length<500)break;} return out;
}
async function load(){
 if(!ready()||busy||!card?.isConnected)return; busy=true;
 const note=q('#tctsNote'),month=q('#tctsMonth').value,start=month+'-01',end=new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),1)).toISOString().slice(0,10),company=cloudProfile.company_id;
 try{
  note.textContent='会社全体を集計中…';
  const [sites,revs,profiles,reports,labor,vehicles,equipment,costs,waste]=await Promise.all([
   all('sites','id,name,status,completed_on',company),all('revenues','id,site_id,revenue_type,revenue_date,amount',company),all('site_project_profiles','site_id,contract_breakdown',company),
   all('daily_reports','id,site_id,report_date,report_data',company),all('labor_cost_sheets','id,site_id,work_date,total_amount',company),
   all('vehicle_cost_sheets','id,site_id,use_date,total_amount',company),all('equipment_cost_sheets','id,site_id,use_date,total_amount',company),
   all('cost_entries','id,site_id,cost_date,amount',company),all('waste_entries','id,site_id,waste_date,amount',company)
  ]);
  const siteMap=new Map(sites.map(s=>[s.id,s])),allowed=id=>siteMap.has(id)&&!isInternal(siteMap.get(id).name);
  let contract=0; for(const r of revs)if(r.revenue_type==='contract'&&allowed(r.site_id)&&siteMap.get(r.site_id).status==='active')contract+=Number(r.amount)||0;
  let progress=0; for(const p of profiles){if(!allowed(p.site_id)||!Array.isArray(p.contract_breakdown))continue;for(const x of p.contract_breakdown)if(x?.target_month===month)progress+=Number(x.amount)||0;}
  const inMonth=d=>d>=start&&d<end; let cost=0;
  const addRows=(rows,dateField)=>{for(const x of rows)if(allowed(x.site_id)&&inMonth(x[dateField]||''))cost+=Number(x.total_amount??x.amount)||0;};
  addRows(labor,'work_date');addRows(vehicles,'use_date');addRows(equipment,'use_date');addRows(costs,'cost_date');addRows(waste,'waste_date');
  // If detailed cost sheets are not populated, preserve the existing report-based summary rather than guessing from report JSON.
  q('#tctsContract').textContent=yen(contract);q('#tctsProgress').textContent=yen(progress);q('#tctsCost').textContent=cost?yen(cost):'既存集計参照';q('#tctsProfit').textContent=cost?yen(progress-cost):'既存集計参照';
  note.textContent='社内作業「会社の清掃」は請負・出来高から除外。完工・過去現場も、この月の出来高は含みます。';
 }catch(e){note.textContent='集計を読み込めませんでした。下の現場別集計はそのまま利用できます。';}
 finally{busy=false;}
}
function boot(){mount();let n=0;const t=setInterval(()=>{n++;if(mount()||n>40)clearInterval(t);},250);document.addEventListener('toya-role-changed',mount);document.addEventListener('click',e=>{if(e.target.closest?.('nav [data-page="homePage"]'))setTimeout(mount,0);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();