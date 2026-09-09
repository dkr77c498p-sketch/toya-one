from pathlib import Path
import hashlib
import subprocess
root=Path(__file__).resolve().parents[1]
out=root/'docs'
def blob(data): return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
expected={
 'index.html':'b9ce738068c54974d19d5c3f5d40f485a177c29a',
 'labor-cost-admin.js':'d77ac865d88a3bd1314197401c65eca6c78ebfe0',
 'site-financial-summary.js':'9d3f1712ae487fcb5be736530c2475a51e75ec1d',
 'dispatch-travel.js':'c2e4f1596650b99cbb50072ea7dd8e27584f7aad'
}
for name,sha in expected.items():
 assert blob((out/name).read_bytes())==sha, 'Source changed; stop before patching: '+name

def replace(s,old,new):
 assert s.count(old)==1,('anchor mismatch',old[:150],s.count(old))
 return s.replace(old,new,1)

index=(out/'index.html').read_text()
index=replace(index,'<script src="labor-cost-admin.js?v=20260908-labor-simple-v2"></script>','<script src="dispatch-travel.js?v=20260909-travel-v1"></script>\n<script src="labor-cost-admin.js?v=20260909-travel-v1"></script>')
index=replace(index,'<script src="site-financial-summary.js?v=20260909-transport-v1"></script>','<script src="site-financial-summary.js?v=20260909-travel-v1"></script>')
(out/'index.html').write_text(index)

labor=(out/'labor-cost-admin.js').read_text()
labor=replace(labor,"  'use strict';", "  'use strict';\n  const travelEngine = window.ToyaDispatchTravelEngine;")
old="""    return rates.filter(r => r.active !== false).map(r => newEntry(r,
      r.kind === 'own' && names.has(norm(r.label)) ? 1 : r.code === 'meiken' ? meiken : r.code === 'asahi' ? asahi : 0));"""
new="""    return rates.filter(r => r.active !== false).map(rate => {
      const r = newEntry(rate, rate.kind === 'own' && names.has(norm(rate.label)) ? 1 : rate.code === 'meiken' ? meiken : rate.code === 'asahi' ? asahi : 0);
      if (rate.kind === 'dispatch' && ['meiken','asahi'].includes(rate.code) && travelEngine) {
        const travel = travelEngine.resolve(reports, rate.code, rate.city_per_vehicle);
        if (travel.entry && !travel.conflict) {
          r.area = travel.entry.area || 'city'; r.vehicles = travel.entry.vehicles ?? 0;
          r.highway = travel.highway ?? 0; r.manualTravel = travel.entry.manualTravel;
          r.memo = travel.entry.memo;
        }
        r.travelImportNote = travel.issues.join(' ');
      }
      return r;
    });"""
labor=replace(labor,old,new)
old="""        msg(`日報${reports.length}件から人数を読み込みました。全日・半日、通勤台数、市外交通費、高速代を確認してください。"""
new="""        msg(`日報${reports.length}件から人数・記録済みの通勤台数・交通費を読み込みました。${rows.filter(r=>r.travelImportNote).map(r=>r.label+'：'+r.travelImportNote).join(' ')} 全日・半日、通勤台数、市外交通費、高速代を確認してください。"""
labor=replace(labor,old,new)
(out/'labor-cost-admin.js').write_text(labor)

summary=(out/'site-financial-summary.js').read_text()
summary=replace(summary,"  'use strict';", "  'use strict';\n  const travelEngine = typeof module === 'object' && module.exports ? require('./dispatch-travel.js') : window.ToyaDispatchTravelEngine;")
old="""        const counts = [...new Set(working.map(x => x.n))];
        if (counts.length !== 1 || !fullDay(working.map(x => x.r))) {note(label + 'の人数・勤務区分が一定でありません。この会社の人工は要確認です。'); return;}
        const rate = findRate(data.laborRates, r => r.kind === 'dispatch' && r.code === code, label); if (!rate) return;
        const value = rateValue(rate, 'day_rate', label); if (value === null) return;
        const cost = round(value * counts[0]);
        entries.push({key: code, label, kind: 'dispatch', full: counts[0], half: 0, cost});
        sheet.cost_total = round(sheet.cost_total + cost);
        note(label + 'の人件費は自動計算済み。通勤台数・市内/市外・高速代は日報に記録がないため含めていません（交通費等のみ要確認）。');
        if (working.length > 1) note(label + 'が同じ現場の複数日報にあります。同一班とみなし人数を1回だけ計算しています。別班なら調整してください。');"""
new="""        const counts = [...new Set(working.map(x => x.n))];
        const rate = findRate(data.laborRates, r => r.kind === 'dispatch' && r.code === code, label); if (!rate) return;
        if (!travelEngine) throw new Error('交通費の計算処理を読み込めませんでした。再読み込みしてください。');
        const travel = travelEngine.resolve(own, code, rate.city_per_vehicle);
        travel.issues.forEach(issue => note(label + '：' + issue));
        let laborCost = 0;
        if (counts.length !== 1 || !fullDay(working.map(x => x.r))) note(label + 'の人数・勤務区分は要確認です。記録済みの交通費は勤務時間で半額にせず計上しています。');
        else {const value = rateValue(rate, 'day_rate', label); if (value !== null) laborCost = round(value * counts[0]);}
        const cost = round(laborCost + travel.value);
        entries.push({key: code, label, kind: 'dispatch', full: counts[0], half: 0, cost, laborCost, travel:travel.travel, highway:travel.highway});
        sheet.cost_total = round(sheet.cost_total + cost);
        if (working.length > 1) note(label + 'が同じ現場の複数日報にあります。同一班とみなし人数を1回だけ計算しています。別班なら調整してください。');"""
summary=replace(summary,old,new)
summary=replace(summary,"labor: '人件費・常用費'", "labor: '人件費・常用費（交通費込）'")
summary=replace(summary,'明建・朝日の未記録の通勤台数を人数から推測しません。','明建・朝日の通勤費・高速代は日報の専用欄から人件費内へ1回だけ加算します。市内は台数×登録単価、市外・特別料金は入力合計額です。半日でも通勤費は半額にしません。未記録の通勤台数を人数から推測しません。')
(out/'site-financial-summary.js').write_text(summary)
for name in ('dispatch-travel.js','labor-cost-admin.js','site-financial-summary.js'):subprocess.run(['node','--check',str(out/name)],check=True)
# Check byte-identical output against files already tested in a mobile browser.
outputs={'index.html':'aac7bcb68b0680945b1072319d92e1d86e81daad','labor-cost-admin.js':'a00e6b71b69d5d92969a31cbb65937af980b1eff','site-financial-summary.js':'15d8a19cf1d6a790cbf6e36e5f2841ad683f268e'}
for name,sha in outputs.items(): assert blob((out/name).read_bytes())==sha, 'Generated content does not match tested files: '+name
print('Dispatch travel integration verified. Existing auth and stored reports unchanged.')
