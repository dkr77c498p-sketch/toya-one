from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


ui_path = Path('docs/site-period-ledger-ui.r1.js')
ui = ui_path.read_text()
insert_at = " async function open(options={}){"
summary_api = r''' async function ensureSummaryData(){
  if(data)return data;
  if(loading){
   const started=Date.now();
   while(loading&&Date.now()-started<35000)await new Promise(resolve=>setTimeout(resolve,100));
   if(data)return data;
   if(loading)throw Error('全期間集計の読み込みが時間切れになりました。');
  }
  if(dirty||saving)throw Error('月別売上の入力中です。保存または閉じてから現在合計を更新してください。');
  await load();
  if(!data)throw Error('全期間の売上・原価を読み込めませんでした。');
  return data;
 }
 async function summaries(siteIds=[],asOfMonth=monthNow()){
  if(!Array.isArray(siteIds)||!E.monthOK(asOfMonth))throw Error('集計する現場・月を確認してください。');
  if(!mount())throw Error('管理者としてログインし直してください。');
  const prepared=await ensureSummaryData();
  return siteIds.map(id=>E.analyze(prepared,id,{companyId:cloudProfile.company_id,complete:true,asOfMonth}));
 }
'''
if 'async function summaries(siteIds=[]' not in ui:
    ui = replace_once(ui, insert_at, summary_api + insert_at, 'site period summary API insertion')
ui = replace_once(
    ui,
    " window.ToyaSitePeriodUI=Object.freeze({open,isBusy:()=>saving||dirty});",
    " window.ToyaSitePeriodUI=Object.freeze({open,summaries,isBusy:()=>saving||dirty});",
    'site period API export',
)
ui_path.write_text(ui)

index_path = Path('docs/index.html')
index = index_path.read_text()
index = replace_once(
    index,
    '<script src="waste-price-master.js?v=20261105-auto-amount-r1"></script>',
    '<script src="waste-price-master.js?v=20261105-auto-amount-r1"></script>\n<script src="waste-price-autofill-r1.js?v=20261107-r1"></script>',
    'waste autofill loader',
)
index = replace_once(
    index,
    '<script src="company-monthly-sales-layout-r1.js?v=20261105-stable-r2"></script>\n',
    '',
    'remove obsolete aggregate layout',
)
index = replace_once(
    index,
    '<script src="company-per-site-sales-r1.js?v=20261106-hide-legacy-r1"></script>',
    '<script src="company-per-site-sales-r2.js?v=20261107-current-totals-r1"></script>',
    'per-site summary loader',
)
index = replace_once(
    index,
    '<script src="site-period-ledger-ui.r1.js?v=20261013-lifetime-profit-r1"></script>',
    '<script src="site-period-ledger-ui.r1.js?v=20261107-summary-api-r1"></script>',
    'site period UI cache version',
)
index_path.write_text(index)
