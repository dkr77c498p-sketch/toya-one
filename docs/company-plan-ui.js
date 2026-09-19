(() => {
 'use strict';
 const names={daily:'プラン1｜日報・集計',billing:'プラン2｜日報・集計＋請求書',complete:'プラン3｜日報・集計＋請求書＋見積書・積算'};
 let key='';
 function paint(){
  const p=typeof cloudProfile!=='undefined'?cloudProfile:null,v=window.ToyaCompanyAccess?.view();
  const next=p?.active&&p.role==='admin'&&v?p.id+':'+p.company_id+':'+v.plan:'';
  if(next===key&&(!next||document.querySelector('#companyPlanCard')))return;
  key=next;document.querySelector('#companyPlanCard')?.remove();if(!next||v.internal)return;
  const card=document.createElement('section');card.id='companyPlanCard';card.className='card admin-home-only';
  card.innerHTML='<h2>ご利用プラン</h2><p id="companyPlanName" style="font-weight:800"></p><p id="companyPlanFeatures" class="note"></p><details><summary>最初にすること・プランの違い</summary><ol><li>登録管理で、自社の会社情報・社員・車両・重機を登録します。</li><li>社員IDを発行し、各社員にログイン情報を渡します。</li><li>日報を入力すると、一覧や現場別の集計で確認できます。</li></ol><p class="note">請求書はプラン2・3、見積書と積算はプラン3で利用できます。書類の作成は管理者が行います。</p><p class="note">契約外の書類機能は表示されません。プランを変更しても保存済みの書類は削除されず、対象プランで再び開けます。会社情報・社員・車両・重機の登録は全プラン共通です。</p><a href="plans.html" class="btn light" style="display:block;text-align:center">3プランの内容を見る</a><p class="note">プラン変更は契約内容を確認して販売元が反映します。この画面から勝手に変更されたり、料金が発生したりすることはありません。</p></details>';
  card.querySelector('#companyPlanName').textContent=v.internal?'TOYA社内用｜全機能':names[v.plan]||'確認中';
  card.querySelector('#companyPlanFeatures').textContent='利用できる機能：'+['日報・集計',...(v.features?.invoice?['請求書']:[]),...(v.features?.estimate?['見積書・積算']:[])].join('、');
  const anchor=document.querySelector('#estimatePlanCard,#projectBusinessCard,#siteSummaryCard');if(anchor)anchor.before(card);else document.querySelector('#homePage')?.append(card);
 }
 document.addEventListener('toya-role-changed',paint);document.addEventListener('click',e=>{if(e.target.closest('nav [data-page]'))paint();});
 setInterval(paint,1000);paint();
})();
