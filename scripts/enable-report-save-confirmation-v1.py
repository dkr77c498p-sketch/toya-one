from pathlib import Path
import hashlib,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'docs/index.html'
b=p.read_bytes()
def blob(b): return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
if blob(b)!='ac05708a23680771f21ffb7162433292883da712': raise RuntimeError('Baseline changed; stop without publishing')
s=b.decode()
def replace(old,new):
 global s
 if s.count(old)!=1: raise RuntimeError('Unexpected anchor: '+old[:80])
 s=s.replace(old,new,1)
start=s.index('async function cloudSaveReport(d){');end=s.index('function cloudSafePhotoId',start)
s=s[:start]+(ROOT/'scripts/report-save-confirmation-functions.js').read_text()+'\n'+s[end:]
replace('    cloudId:r.id,','    cloudId:r.id,\n    cloudUpdatedAt:r.updated_at||null,')
replace('id:editingReport?.id??Date.now(),cloudCreatedById:', 'id:editingReport?.id??Date.now(),cloudId:editingReport?.cloudId||null,cloudUpdatedAt:editingReport?.cloudUpdatedAt||null,cloudCreatedById:')
# Match the UI to the existing database ownership check, without granting access.
replace('  const canDelete=cloudProfile&&', '  const canEdit=cloudCanEditReport(d);\n  const canDelete=cloudProfile&&')
replace('<button class="btn light" onclick="editCloudReport(\'${d.cloudId}\')">編集</button><button class="btn light" onclick="duplicateCloudReport(\'${d.cloudId}\')">別現場へ複製</button>', '${canEdit?`<button class="btn light" onclick="editCloudReport(\'${d.cloudId}\')">編集</button><button class="btn light" onclick="duplicateCloudReport(\'${d.cloudId}\')">別現場へ複製</button>`:\'<span class="note">閲覧のみ（変更は登録者本人・管理者）</span>\'}')
replace("if(!d)return alert('日報が見つかりません。');closeCloudReportDetail();fillReportForm(d,'edit')", "if(!d)return alert('日報が見つかりません。');if(!cloudCanEditReport(d))return alert('この日報を変更できるのは登録した本人か管理者です。');closeCloudReportDetail();fillReportForm(d,'edit')")
replace("if(!d)return;closeCloudReportDetail();fillReportForm({...d,id:Date.now(),cloudId:null,cloudCreatedById:null,cloudCreatedByName:''},'duplicate')", "if(!d)return;if(!cloudCanEditReport(d))return alert('他の社員の日報は閲覧のみです。本人か管理者へ確認してください。');closeCloudReportDetail();fillReportForm({...d,id:Date.now(),cloudId:null,cloudUpdatedAt:null,cloudCreatedById:null,cloudCreatedByName:''},'duplicate')")
# Validate permissions before saving local records/photos or clearing the draft.
start=s.index('async function saveReport(){');end=s.index('const PHOTO_CATEGORIES',start)
part=s[start:end]
part=part.replace("  const d=collect();\n  if(!validate(d))return;\n  try{", "  if(window.__toyaReportSaveBusy)return;\n  const d=collect();\n  if(!validate(d))return;\n  window.__toyaReportSaveBusy=true;const saveButton=$('#saveReportBtn');if(saveButton)saveButton.disabled=true;\n  try{\n    if(cloudProfile){const c=await cloudReportWriteContext(d);if(c.target){d.cloudId=c.target.id;d.cloudUpdatedAt=c.target.updated_at;}}",1)
part=part.replace("    if(cloudProfile){\n      try{\n        const cloudResult=await cloudSaveReport(d);", "    if(cloudProfile){\n      let cloudResult=null;\n      try{\n        cloudResult=await cloudSaveReport(d);\n        if(!cloudResult?.verified)throw new Error('クラウドの保存結果を確認できませんでした。');\n        d.cloudId=cloudResult.id;d.cloudUpdatedAt=cloudResult.updatedAt;\n        const savedLocal=get(LS.reports,[]),savedIndex=savedLocal.findIndex(x=>String(x.id)===String(d.id));\n        if(savedIndex>=0){savedLocal[savedIndex]=d;set(LS.reports,savedLocal);}\n        await cloudLogActivity('report_save',cloudResult.id,{site:d.site,date:d.date,verified:true});",1)
part=part.replace("        await cloudLogActivity('report_save',cloudResult?.id,{site:d.site,date:d.date});\n",'',1)
old="""        cloudNote='／クラウド同期失敗';
        cloudMsg('日報・写真のクラウド同期に失敗：'+(cloudErr?.message||cloudErr),'warn');"""
new="""        if(!cloudResult?.verified){set(LS.draft,d);throw cloudErr;}
        cloudNote='／日報はクラウド確認済み・写真または産廃の同期は要確認';
        cloudMsg('日報本文は保存済みです。写真・産廃の同期を確認してください：'+(cloudErr?.message||cloudErr),'warn');
        cloudLoadReports();"""
if old not in part:raise RuntimeError('catch mismatch')
part=part.replace(old,new,1)
part=part.replace("    alert('写真の保存に失敗しました。もう一度お試しください。');\n  }", "    const message='保存を完了できませんでした：'+(err?.message||err)+'\\n入力画面は残しています。成功表示にはしていません。';\n    showStatus(message);cloudMsg(message,'bad');alert(message);\n  }finally{window.__toyaReportSaveBusy=false;if(saveButton)saveButton.disabled=false;}",1)
s=s[:start]+part+s[end:]
# The legacy site-move path must not advance when report writes are rejected.
start=s.index('async function saveCurrentReportBeforeMove(){');end=s.index('async function applyMovedSite',start)
part=s[start:end].replace('  try{\n    const addedPhotos=', '  try{\n    if(cloudProfile)await cloudReportWriteContext(d);\n    const addedPhotos=',1)
part=part.replace("}catch(cloudErr){console.error(cloudErr);cloudMsg('1現場目は端末に保存しましたが、クラウド同期に失敗：'+(cloudErr?.message||cloudErr),'warn');}", "}catch(cloudErr){set(LS.draft,d);throw cloudErr;}",1)
s=s[:start]+part+s[end:]
if blob(s.encode())!='982e403cf4c7ced3b1791ab0f1b44a3ac65598dd': raise RuntimeError('Generated bytes mismatch')
p.write_text(s)
# Parse the complete inline script, not just snippets.
# Main script has a plain <script> tag in this version.
main=s[s.index('const $='):s.index('</script>\n<script src="midway.js')]
subprocess.run(['node','--check','-'],input=main,text=True,check=True)
subprocess.run(['node',str(ROOT/'tests/report-save-confirmation.cjs')],check=True)
print('Verified report-save confirmation; reports, rates, authentication and RLS were not changed.')
