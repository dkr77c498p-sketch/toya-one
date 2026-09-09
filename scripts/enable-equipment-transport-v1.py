from pathlib import Path
import hashlib
import subprocess

root = Path(__file__).resolve().parents[1]
def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
module = root / 'docs/equipment-transport.js'
assert blob(module.read_bytes()) == 'a54a4d605708feaffaf431d44201747ccd3f48f3', 'Transport module changed; stop'
p = root / 'docs/site-financial-summary.js'
page = root / 'docs/index.html'
if blob(p.read_bytes()) == '9d3f1712ae487fcb5be736530c2475a51e75ec1d' and blob(page.read_bytes()) == 'b9ce738068c54974d19d5c3f5d40f485a177c29a':
    print('Verified integration already enabled')
    raise SystemExit(0)
assert blob(p.read_bytes()) == '0907bc614cb9592cb043b5ac43eaa249b2897521', 'Summary baseline changed; stop'
assert blob(page.read_bytes()) == '4109740c646b1fb1a516270e3c10c10cbcbc5317', 'App baseline changed; stop'
s = p.read_text()
def one(a, b):
    global s
    assert s.count(a) == 1, ('Unexpected patch anchor', a[:100], s.count(a))
    s = s.replace(a, b)
one("  'use strict';", "  'use strict';\n  const transportEngine = typeof module === 'object' && module.exports ? require('./equipment-transport.js') : window.ToyaTransportEngine;")
one('fuel: 0, waste: 0, other: 0, revenue: 0', 'fuel: 0, waste: 0, transport: 0, other: 0, revenue: 0')
one('waste: {value: 0, count: 0, missing: 0}, other:', 'waste: {value: 0, count: 0, missing: 0}, transport: {value: 0, count: 0, missing: 0}, other:')
one('const writerCounts = new Map(), fuelFingerprints = new Map();', 'const writerCounts = new Map(), fuelFingerprints = new Map(), transportFingerprints = new Map();')
one("""      list(d.items).forEach(x => {
        const kind = x.isWaste""", """      list(d.items).forEach(x => {
        if (String(x.name || '').startsWith('重機回送：')) {
          if (!transportEngine) throw new Error('回送計算のプログラムを読み込めませんでした。再読み込みしてください。');
          const c = transportEngine.calculate(x, data.transportRates);
          addExpense('transport', c.value, date);
          if (c.issue) warnings.add(date + '：' + c.issue);
          const fp = JSON.stringify([date, normal(x.name), x.qty, x.unit]);
          if (transportFingerprints.has(fp)) warnings.add(date + '：同じ会社・重機・距離・回数の回送が複数あります。別の運搬か二重記録か確認してください。自動削除はしません。');
          transportFingerprints.set(fp, r.id);
          return; // Never add the same transport expense to "other" too.
        }
        const kind = x.isWaste""")
one('d.labor + d.vehicle + d.equipment + d.fuel + d.waste + d.other', 'd.labor + d.vehicle + d.equipment + d.fuel + d.waste + d.transport + d.other')
one('expenses.fuel.value + expenses.waste.value + expenses.other.value', 'expenses.fuel.value + expenses.waste.value + expenses.transport.value + expenses.other.value')
one("['waste', '処分費（日報の記録分）'], ['other',", "['waste', '処分費（日報の記録分）'], ['transport', '重機回送費（自動計算・手入力）'], ['other',")
one('＋処分費＋その他経費。', '＋処分費＋重機回送費＋その他経費。')
one("' ／ 処分費 ' + yen(d.waste) + ' ／ その他 '", "' ／ 処分費 ' + yen(d.waste) + ' ／ 回送費 ' + yen(d.transport) + ' ／ その他 '")
one('メモだけの金額、未入力の回送・リース・小型機械費などは自動加算しません。', '回送は日報の専用欄に追加した重機1台・片道回数×現行登録単価で計算し、手入力の合計額（0円も含む）を優先します。運搬会社へ支払う回送費から自社燃料代を差し引きません。メモだけの金額、未入力の回送・リース・小型機械費などは自動加算しません。')
one("['equipmentRates', 'equipment_rate_master', 'id,code,label,daily_rate,active', null, null]", "['equipmentRates', 'equipment_rate_master', 'id,code,label,daily_rate,active', null, null],\n        ['transportRates', 'equipment_transport_rate_master', 'id,carrier,machine_name,distance_label,unit_price,price_basis,active', null, null]")
assert blob(s.encode()) == '9d3f1712ae487fcb5be736530c2475a51e75ec1d', 'Summary differs from tested output'
p.write_text(s)
s = page.read_text()
a = '<script src="site-financial-summary.js?v=20260909-auto-v2"></script>'
assert s.count(a) == 1
s = s.replace(a, '<script src="equipment-transport.js?v=20260909-transport-v1"></script>\n<script src="site-financial-summary.js?v=20260909-transport-v1"></script>')
assert blob(s.encode()) == 'b9ce738068c54974d19d5c3f5d40f485a177c29a', 'App differs from tested loader-only change'
page.write_text(s)
subprocess.run(['node', '--check', str(module)], check=True)
subprocess.run(['node', '--check', str(p)], check=True)
# Synthetic fixture only. Never publish company prices or read/write production data.
subprocess.run(['node', '-e', r"""
const assert=require('node:assert/strict');
const t=require('./docs/equipment-transport.js');
const s=require('./docs/site-financial-summary.js');
const rate={carrier:'検証運搬',machine_name:'検証重機',distance_label:'検証距離',unit_price:123,price_basis:'one_way_per_machine',active:true};
const item={name:t.encode(rate),unit:'片道回',qty:2,price:'',company:rate.carrier};
assert.equal(t.calculate(item,[rate]).value,246);
assert.equal(t.calculate({...item,price:'0'},[rate]).value,0);
assert.equal(t.calculate({...item,price:'55'},[rate]).value,55);
assert.equal(t.calculate({...item,qty:1.5},[rate]).value,null);
assert.equal(t.calculate(item,[]).value,null);
const site={id:'test-site',name:'検証現場'};
const data={reports:[{id:'test-report',site_id:site.id,report_date:'2026-09-02',updated_at:'2026-09-02T09:00:00Z',report_data:{site:site.name,items:[item,{name:'材料',price:17}],fuels:[]}}],laborSheets:[],vehicleSheets:[],equipmentSheets:[],laborRates:[],vehicleRates:[],equipmentRates:[],transportRates:[rate]};
const before=JSON.stringify(data),out=s.analyze(data,site);
assert.equal(out.subtotal,263);assert.equal(out.days[0].subtotal,263);
assert.equal(out.expenses.transport.value,246);assert.equal(out.expenses.other.value,17);
assert.equal(JSON.stringify(data),before);
console.log('Transport integration checks passed');
"""], check=True, cwd=root)
print('Only the tested home summary and two loader lines were changed.')
