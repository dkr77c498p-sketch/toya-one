"""Apply only to the staged bridge. Production files and databases are never touched."""
from pathlib import Path
import hashlib
p=Path(__file__).resolve().parent/'general-waste-daily-bridge.js'
b=p.read_bytes()
assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='fd186d06af6a923d532c87ae2a3a696f7061f91f','Staged bridge changed; review before applying.'
s=b.decode();start=s.index(' function bind(host,options){');end=s.index(' function extractReports(',start)
s=s[:start]+r''' function bind(host,options){
  for(const n of ['collect','fillReportForm','clearReportEditState'])if(typeof host[n]!=='function')throw Error('日報の入力プログラムを確認してください：'+n);
  if(host.__generalWasteStagingBridge)throw Error('一般廃棄物の日報連携は接続済みです。');
  const getProfile=options.getProfile,changed=options.onChange||(()=>{});let session=null,owner='',disposed=false;
  const originals={collect:host.collect,fill:host.fillReportForm,clear:host.clearReportEditState};
  const active=()=>{
   const p=getProfile();let id='';try{id=identity(p);}catch(_){/* Ordinary logged-out app operations must still work. */}
   if(disposed)return null;
   if(id!==owner){owner=id;session=id?new Session(p):null;changed([]);}
   return id?p:null;
  };
  const required=()=>{const p=active();if(!p)throw Error('ログイン中の会社・入力者を確認してください。');return p;};
  const collect=function(){if(disposed)return originals.collect.apply(this,arguments);const p=active(),out=originals.collect.apply(this,arguments);if(!p){const next=clone(out);delete next[KEY];return next;}return session.capture(out,p);};
  const fill=function(d,mode='edit'){
   if(disposed)return originals.fill.apply(this,arguments);
   const p=active();if(!p){if(own(d,KEY))throw Error('一般廃棄物の記録はログイン後に開いてください。');return originals.fill.apply(this,arguments);}
   const prepared=new Session(p);prepared.load(d,p,mode);
   const out=originals.fill.apply(this,arguments);session=prepared;changed(session.entries(p));return out;
  };
  const clear=function(){if(disposed)return originals.clear.apply(this,arguments);const p=active(),out=originals.clear.apply(this,arguments);if(p)session.reset(p);changed([]);return out;};
  host.collect=collect;host.fillReportForm=fill;host.clearReportEditState=clear;
  const api={
   entries(){const p=active();return p?session.entries(p):[];},
   add(values,id){const p=required(),key=session.add(values,originals.collect(),p,id);changed(session.entries(p));return key;},
   update(id,values){const p=required();session.update(id,values,p);},
   remove(id,confirmed){const p=required();session.remove(id,p,confirmed);changed(session.entries(p));},
   changedIdentity(){active();},
   dispose(){
    disposed=true;session=null;owner='';
    // Do not replace any wrapper installed after this bridge. Retained wrappers
    // transparently call the original after disposal, without carrying entries.
    if(host.collect===collect)host.collect=originals.collect;
    if(host.fillReportForm===fill)host.fillReportForm=originals.fill;
    if(host.clearReportEditState===clear)host.clearReportEditState=originals.clear;
    delete host.__generalWasteStagingBridge;
   }
  };
  host.__generalWasteStagingBridge=api;active();return api;
 }
''' +s[end:]
old='const source=extractReports(rows,profile.companyId),records=[],issues=[...source.issues];'
assert s.count(old)==1
s=s.replace(old,r'''const source=extractReports(rows,profile.companyId),records=[],issues=[...source.issues];
  source.coverage.legacyReports=rows.filter(row=>{
   if(!row||row.company_id!==profile.companyId||object(row.report_data)&&own(row.report_data,KEY))return false;
   const date=text(row.report_date||row.report_data?.date);
   return !/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)===month;
  }).length;''',1)
assert hashlib.sha256(s.encode()).hexdigest()=='e50388058bdb5e3723fa0c172eb20c08a8e5f81df2b54e1689af4063b2603b37','Output differs from reviewed bridge.'
p.write_text(s)
print('Only staged bridge changed; no live module or data was written.')
