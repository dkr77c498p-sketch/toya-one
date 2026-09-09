/* TOYA One verified report writes. Uses existing RLS; no permission/schema changes. */
function cloudCanEditReport(d){
  return Boolean(cloudProfile?.active===true && (cloudProfile.role==='admin' ||
    (d?.cloudCreatedById && String(d.cloudCreatedById)===String(cloudProfile.id))));
}
async function cloudReportWriteContext(d){
  if(!cloudClient||!cloudProfile?.active)throw new Error('接続状態を確認してください。クラウドには保存していません。');
  const profile={...cloudProfile};
  const {data:{session},error}=await cloudClient.auth.getSession();
  if(error)throw error;
  if(!session?.user?.id||session.user.id!==profile.id)throw new Error('ログインの確認が必要です。入力はそのまま残っています。');
  if(d.id==null)throw new Error('日報IDを確認できませんでした。新しい日報として勝手に登録しません。');
  const edit=typeof editingReport!=='undefined'&&String(editingReport?.id)===String(d.id)?editingReport:null;
  const cloudId=d.cloudId||edit?.cloudId;
  const fields='id,company_id,created_by,updated_at,source_report_id';
  let query=cloudClient.from('daily_reports').select(fields).eq('company_id',profile.company_id);
  query=cloudId?query.eq('id',cloudId):query.eq('source_report_id',String(d.id));
  const result=await query.limit(2);if(result.error)throw result.error;
  if(result.data?.length>1)throw new Error('同じ日報IDが複数あります。管理者が確認してください。');
  const target=result.data?.[0]||null;
  if(cloudId&&!target)throw new Error('編集元の日報が見つかりません。削除や変更がないか管理者へ確認してください。');
  if(target&&profile.role!=='admin'&&target.created_by!==profile.id)
    throw new Error('この日報は別の社員が登録しています。変更できるのは登録した本人か管理者です。');
  if(!target&&profile.role!=='admin'&&d.cloudCreatedById&&d.cloudCreatedById!==profile.id)
    throw new Error('他の社員の日報として保存できません。本人か管理者へ確認してください。');
  const expected=d.cloudUpdatedAt||edit?.cloudUpdatedAt;
  if(target&&expected&&Date.parse(expected)!==Date.parse(target.updated_at))
    throw new Error('この日報は編集中に更新されています。入力を残したまま、最新の日報を確認してください。');
  if(cloudProfile?.id!==profile.id||cloudProfile?.company_id!==profile.company_id)
    throw new Error('ログイン状態が変わりました。保存していません。');
  return {profile,target,sourceReportId:String(target?.source_report_id??d.id)};
}
function cloudReportDataEqual(a,b){
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  return JSON.stringify(stable(a))===JSON.stringify(stable(b));
}
async function cloudSaveReport(d){
  const context=await cloudReportWriteContext(d),profile=context.profile;
  let target=context.target;
  const siteId=await cloudEnsureSite(d.site);
  if(!target){
    const legacy=await cloudClient.from('daily_reports').select('id,company_id,created_by,updated_at,source_report_id')
      .eq('company_id',profile.company_id).eq('site_id',siteId).eq('report_date',d.date||today())
      .eq('recorder_name',d.writer||profile.name||'').eq('work_content',cloudWorkText(d))
      .is('source_report_id',null).limit(2);
    if(legacy.error)throw legacy.error;
    if(legacy.data?.length>1)throw new Error('旧日報が複数一致しました。削除・統合せず、管理者の確認が必要です。');
    target=legacy.data?.[0]||null;
  }
  if(target&&profile.role!=='admin'&&target.created_by!==profile.id)
    throw new Error('この日報を変更できるのは登録した本人か管理者です。');
  if(cloudProfile?.id!==profile.id||cloudProfile?.company_id!==profile.company_id)
    throw new Error('ログイン状態が変わりました。保存していません。');
  const creator=target?target.created_by:profile.id;
  const reportData=JSON.parse(JSON.stringify({...d,cloudSubmittedById:creator,
    cloudSubmittedByName:d.cloudCreatedByName||profile.name||''}));
  const row={company_id:profile.company_id,site_id:siteId,source_report_id:String(target?.source_report_id??d.id),
    report_date:d.date||today(),recorder_name:d.writer||profile.name||'',weather:d.weather||'',work_content:cloudWorkText(d),
    worker_count:(d.workers||[]).length+(d.otherWorker?1:0),dispatch_count:Number(d.meikenCount||0)+Number(d.asahiCount||0),
    start_time:d.start||null,end_time:d.end||null,overtime_hours:Number(d.overtime||0),notes:d.memo||'',
    created_by:creator,report_data:reportData,updated_at:new Date().toISOString()};
  let request;
  if(target){
    request=cloudClient.from('daily_reports').update(row).eq('company_id',profile.company_id).eq('id',target.id);
    request=target.updated_at?request.eq('updated_at',target.updated_at):request.is('updated_at',null);
  }else request=cloudClient.from('daily_reports').insert(row);
  const result=await request.select('id,company_id,site_id,created_by,report_date,recorder_name,report_data,updated_at');
  if(result.error)throw result.error;
  const saved=result.data?.length===1?result.data[0]:null;
  if(!saved)throw new Error('クラウドの保存を確認できませんでした。権限または同時更新を確認してください。');
  if((target&&saved.id!==target.id)||saved.company_id!==profile.company_id||saved.site_id!==siteId||
    saved.created_by!==creator||saved.report_date!==row.report_date||saved.recorder_name!==row.recorder_name||
    !cloudReportDataEqual(saved.report_data,reportData))
    throw new Error('保存結果が入力内容と一致しません。保存成功として扱わず、管理者の確認が必要です。');
  return {id:saved.id,updated:!!target,inserted:!target,verified:true,updatedAt:saved.updated_at};
}
