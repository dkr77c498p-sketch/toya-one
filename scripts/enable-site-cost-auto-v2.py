from pathlib import Path
import hashlib
import subprocess

root = Path(__file__).resolve().parents[1]
page = root / 'docs/index.html'
target = root / 'docs/site-financial-summary.js'

def sha(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

expected_old = '4d792d1e298846ce49ddbae8438e879db0cbc5ba'
expected_new = '0907bc614cb9592cb043b5ac43eaa249b2897521'
old_tag = 'site-financial-summary.js?v=20260909-summary-v1'
new_tag = 'site-financial-summary.js?v=20260909-auto-v2'
if sha(target.read_bytes()) == expected_new and new_tag in page.read_text():
    print('Already enabled; no writes')
    raise SystemExit(0)
assert sha(target.read_bytes()) == expected_old, 'Summary changed since verification; stop for review'
assert sha(page.read_bytes()) == '904062f29744ab6fc26a3f1aacc0bccb3904868d', 'App changed since verification; stop for review'
functions = root / 'scripts/site-cost-auto-v2-functions.js'
assert sha(functions.read_bytes()) == 'ac6d2dc1aab8d3f38e023ed1011e61267638679c', 'Automatic functions differ from tested version'
s = target.read_text()

def change(a, b):
    global s
    assert s.count(a) == 1, ('Patch must have exactly one match', a[:120], s.count(a))
    s = s.replace(a, b)

change('/* TOYA One site cost summary v1. Read-only admin view; no auth, report or cost writes. */','/* TOYA One site cost summary v2. Automatic estimates + saved overrides; read-only admin view. */')
change('  /** Calculate only known amounts, retaining missing and stale coverage separately. */', functions.read_text()+'\n  /** Saved adjustments take priority; otherwise derive display-only daily estimates. */')
change("const saved = list(data[source]).filter(s => s.site_id === site.id), dateMap = new Map();", """const stored = list(data[source]).filter(s => s.site_id === site.id);
      const autoDates = [], reviewDates = [], saved = [...stored], dateMap = new Map();
      [...needed[kind]].sort().forEach(date => {
        if (stored.some(s => s.work_date === date)) return;
        const derived = automaticSheet(kind, date, data, site, reports);
        saved.push(derived.sheet); autoDates.push(date);
        if (derived.issues.length) {reviewDates.push(date); derived.issues.forEach(w => warnings.add(w));}
      });""")
change("categories[kind] = {value: sum, gross, deduction, revenue, savedDays: saved.length, missingDates, staleDates};", "categories[kind] = {value: sum, gross, deduction, revenue, savedDays: stored.length, autoDates, reviewDates, missingDates, staleDates};")
change("const engine = Object.freeze({analyze, periodBounds, amount, fuelAmount, signature: sig});", "const engine = Object.freeze({analyze, automaticSheet, periodBounds, amount, fuelAmount, signature: sig});")
change("'<h3>現場原価・費用の集計</h3>", "'<h3>現場原価・自動計算</h3><p class=\"sf-note\">日報から自動計算します。日ごとの費用保存は不要です。保存済みの調整額は優先し、未記録・配分不明の費用だけ要確認にします。</p>")
change("(result.partial ? '確認できる分の原価小計' : '保存・記録済み原価小計')", "'自動計算の原価小計（概算）'")
change("(result.partial ? '未確定・要確認の項目があります。全費用の確定額ではありません。' : '選んだ期間の保存済み費用と日報の入力額です。未記入の費用は含みません。')", "(result.partial ? '入力済みの人数・使用車両・重機を自動計算済み。通勤台数や現場移動などの要確認分・未入力費用は含まれない場合があります。' : '日報×登録単価と入力済み費用の合計です。保存済みの調整額を優先しています。未記入の費用は含みません。')")
change("const value = !c.savedDays && c.missingDates.length ? '未確定' : !c.savedDays ? '使用・費用記録なし' : yen(c.value);", "const value = !c.savedDays && !c.autoDates.length ? '使用・費用記録なし' : yen(c.value) + (c.reviewDates.length ? '［要確認］' : '');")
change("const note = ['保存済み ' + c.savedDays + '日', c.missingDates.length ? '未確定 ' + c.missingDates.length + '日' : '', c.staleDates.length ? '日報変更後の再確認 ' + c.staleDates.length + '日' : ''].filter(Boolean).join(' ／ ');", "const note = ['自動計算 ' + c.autoDates.length + '日', '保存額を優先 ' + c.savedDays + '日', c.reviewDates.length ? '一部費用の要確認 ' + c.reviewDates.length + '日' : '', c.staleDates.length ? '保存後の日報変更 ' + c.staleDates.length + '日（保存額を保持）' : ''].filter(Boolean).join(' ／ ');")
change("const pending = Object.entries(result.categories).filter(([, c]) => c.missingDates.length).map(([kind, c]) => names[kind].replace('（燃料差引後）', '') + c.missingDates.length + '日');", "const pending = Object.entries(result.categories).filter(([, c]) => c.reviewDates.length).map(([kind, c]) => names[kind].replace('（燃料差引後）', '') + c.reviewDates.length + '日');")
change("<p class=\"sf-alert\">未確定：", "<p class=\"sf-alert\">一部費用の要確認：")
change("。管理者の費用確認画面で保存すると反映します。未確定分を0円で確定したり、日報を書き換えたりはしません。", "。計算できる分はすでに小計へ反映済みです。通勤台数や現場間の配分など、不明な分だけ確認・調整してください。通常の日は費用保存なしで表示します。")
change("人件費・常用費（交通費・高速代等を含む保存額）＋車両費の燃料差引後", "人件費（登録単価×日報人数、保存額があればそちらを優先）＋車両費の燃料差引後")
change("給油額は当日の消費額とは限りません。", "自社は同じ日・現場の同じ人を1回だけ、車両・重機も1台につき日額1回で仮計算します。8〜12時間の時間帯が記録された日報は1日勤務として計算し、それ以外の勤務区分・半日・現場間配分は要確認とします。明建・朝日の未記録の通勤台数を人数から推測しません。常用の来る/行くも日報だけで判定できないため保存・調整分を優先します。給油額は当日の消費額とは限りません。")
change("日別の内訳・未確定を確認（", "日別の内訳・自動計算を確認（")
change("(d.pending.includes(kind) ? '未確定' : yen(d[kind]))", "yen(d[kind]) + (result.categories[kind].autoDates.includes(d.date) ? '［自動］' : '［保存額］') + (result.categories[kind].reviewDates.includes(d.date) ? '［一部要確認］' : '')")
change("['vehicleRates', 'vehicle_rate_master', 'id,label,active', null, null],", "['laborRates', 'labor_rate_master', 'id,code,label,kind,day_rate,half_rate,city_per_vehicle,active', null, null],\n        ['vehicleRates', 'vehicle_rate_master', 'id,code,label,daily_rate,active', null, null],")
change("['equipmentRates', 'equipment_rate_master', 'id,label,active', null, null]", "['equipmentRates', 'equipment_rate_master', 'id,code,label,daily_rate,active', null, null]")
change("// Identity check only: never signs out, creates an auth client, or starts a data polling loop.", "// Refresh while the home is visible, at most once a minute. No auth/client or DB writes.\n    setInterval(() => {if (!document.hidden && visible() && identity() && !runningKey) schedule(true);}, 60000);\n    // Identity check only: never signs out or creates an auth client.")
assert sha(s.encode()) == expected_new, 'Patched result differs from locally tested version'
assert all(x not in s for x in ['.insert(', '.update(', '.upsert(', '.delete(', '.signOut(', '.signInWithPassword(']), 'Summary must remain read-only'
original = page.read_text()
assert original.count(old_tag) == 1
updated = original.replace(old_tag, new_tag)
assert updated.replace(new_tag, old_tag) == original
# Staged working-tree changes are published only after the regression suite succeeds.
target.write_text(s)
subprocess.run(['node','--check',str(target)],check=True)
subprocess.run(['node',str(root/'scripts/site-cost-auto-v2.test.js'),str(target)],check=True)
page.write_text(updated)
print('Verified automatic summary; only summary and its loader changed')
