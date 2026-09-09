/* TOYA One site cost summary v2. Automatic estimates + saved overrides; read-only admin view. */
(() => {
  'use strict';
  const travelEngine = typeof module === 'object' && module.exports ? require('./dispatch-travel.js') : window.ToyaDispatchTravelEngine;
  const transportEngine = typeof module === 'object' && module.exports ? require('./equipment-transport.js') : window.ToyaTransportEngine;
  const list = value => Array.isArray(value) ? value : [];
  const normal = value => String(value || '').normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
  const assetKey = value => {
    const k = normal(typeof value === 'string' ? value : value?.name);
    if (k === 'sk55sr') return 'sk55';
    return k === 'アームロール' ? normal('4tアームロール') : k;
  };
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const amount = value => {
    if (value == null || String(value).trim() === '' || typeof value === 'boolean') return null;
    const n = Number(value);
    return Number.isFinite(n) ? round(n) : null;
  };
  const requiredAmount = value => {
    const n = amount(value);
    if (n === null) throw new Error('保存済み金額に読めない値があります。合計は表示しません。');
    return n;
  };
  const sig = reports => list(reports).map(r => {
    const t = Date.parse(r.updated_at);
    const submillis = String(r.updated_at || '').match(/\.(\d+)/)?.[1]?.padEnd(6, '0').slice(3, 6) || '000';
    return String(r.id) + ':' + (Number.isFinite(t) ? t + ':' + submillis : String(r.updated_at || ''));
  }).sort().join('|');
  const uniqueReports = reports => {
    const found = new Map();
    list(reports).forEach(r => {
      if (!r.id) throw new Error('日報の識別番号がありません。集計を中止しました。');
      if (found.has(r.id) && sig([found.get(r.id)]) !== sig([r])) throw new Error('読込中に日報が変わりました。更新してください。');
      found.set(r.id, r);
    });
    return [...found.values()];
  };
  const fuelAmount = f => {
    const direct = amount(f.amount);
    if (f.amount != null && String(f.amount).trim() !== '') return direct;
    const qty = amount(f.qty ?? f.liters), rate = amount(f.unitPrice);
    return qty === null || rate === null ? null : round(qty * rate);
  };
  function periodBounds(mode, value) {
    if (mode === 'all') return {start: '', end: ''};
    if (mode === 'day') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('作業日を選んでください。');
      const d = new Date(value + 'T00:00:00Z');
      if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== value) throw new Error('作業日を確認してください。');
      d.setUTCDate(d.getUTCDate() + 1);
      return {start: value, end: d.toISOString().slice(0, 10)};
    }
    if (mode !== 'month' || !/^\d{4}-\d{2}$/.test(value)) throw new Error('対象月を選んでください。');
    const [year, month] = value.split('-').map(Number);
    if (year < 2000 || month < 1 || month > 12) throw new Error('対象月を確認してください。');
    return {start: value + '-01', end: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)};
  }

  // Read-only estimates. These objects are NEVER written to cost tables or daily reports.
  // Explicitly saved sheets (including manual zero amounts) always take priority.
  function automaticSheet(kind, date, data, site, reports) {
    const all = reports.filter(r => r.report_date === date);
    const own = all.filter(r => r.site_id === site.id);
    const issues = new Set(), entries = [];
    const note = text => issues.add(date + '：' + text);
    const raw = r => r.report_data || {};
    const hasMoves = r => list(raw(r).siteMoves).length > 0;
    const named = v => typeof v === 'string' ? v : String(v?.name || '');
    const others = all.filter(r => r.site_id !== site.id);
    const incoming = others.flatMap(r => list(raw(r).siteMoves).filter(m => normal(m?.site) === normal(site.name)));
    const rateValue = (r, field, label) => {
      const n = amount(r?.[field]);
      if (n === null || n < 0) {note(label + 'の単価が未登録です。その分は含めていません。'); return null;}
      return n;
    };
    const findRate = (rates, match, label) => {
      const found = list(rates).filter(r => r.active !== false && match(r));
      if (found.length !== 1) {note(label + 'の単価を一意に確認できません。その分は含めていません。'); return null;}
      return found[0];
    };
    // A short or unspecified shift cannot establish each person's half/full-day agreement.
    const fullDay = rs => {
      const spans = rs.map(r => {
        const d = raw(r), parse = t => /^\d{2}:\d{2}(?::\d{2})?$/.test(String(t || '')) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : NaN;
        return (parse(d.end) - parse(d.start)) / 60;
      });
      return spans.length > 0 && spans.every(h => Number.isFinite(h) && h >= 8 && h <= 12);
    };
    const sheet = {id: 'automatic:' + kind + ':' + date, site_id: site.id, work_date: date,
      source_reports: (kind === 'labor' ? own : all).map(r => ({id: r.id, updated_at: r.updated_at})),
      entries, cost_total: 0, revenue_total: 0, gross_total: 0, fuel_deduction_total: 0, net_total: 0,
      review_warnings: [], _automatic: true};
    if (kind === 'labor') {
      const workers = new Map();
      own.forEach(r => list(raw(r).workers).forEach(w => {
        const label = named(w), k = normal(label); if (!k) return;
        if (!workers.has(k)) workers.set(k, {label, reports: []});
        workers.get(k).reports.push(r);
      }));
      workers.forEach(({label, reports: rs}, k) => {
        if (rs.some(hasMoves) || others.some(r => list(raw(r).workers).some(w => normal(named(w)) === k))) {
          note(label + 'の現場間の人工配分が必要です。この人の自動加算は保留しています。'); return;
        }
        if (!fullDay(rs)) {note(label + 'は短時間または勤務時間が未記録です。半日・1日の確認分だけ登録管理で調整してください。'); return;}
        const rate = findRate(data.laborRates, r => r.kind === 'own' && normal(r.label) === k, label);
        if (!rate) return;
        const cost = rateValue(rate, 'day_rate', label); if (cost === null) return;
        entries.push({key: rate.code, label, kind: 'own', full: 1, half: 0, cost});
        sheet.cost_total = round(sheet.cost_total + cost);
      });
      [['meiken', 'meikenCount', '明建'], ['asahi', 'asahiCount', '朝日']].forEach(([code, field, label]) => {
        const observed = own.map(r => ({r, n: amount(raw(r)[field])}));
        if (observed.some(x => x.n !== null && (!Number.isInteger(x.n) || x.n < 0))) {note(label + 'の人数を確認してください。'); return;}
        const working = observed.filter(x => x.n > 0); if (!working.length) return;
        if (working.some(x => hasMoves(x.r)) || others.some(r => amount(raw(r)[field]) > 0)) {
          note(label + 'が同日に複数現場へ記録されています。別班か現場移動か不明のため、この会社の人工・交通費は自動加算を保留しています。'); return;
        }
        const counts = [...new Set(working.map(x => x.n))];
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
        if (working.length > 1) note(label + 'が同じ現場の複数日報にあります。同一班とみなし人数を1回だけ計算しています。別班なら調整してください。');
      });
      if (own.some(r => String(raw(r).otherWorker || '').trim())) note('その他の作業者は人数・単価を確定できないため含めていません。');
      if (own.some(r => (amount(raw(r).overtime) || 0) > 0)) note('残業の割増単価が未設定です。残業代は含めていません。');
      if (incoming.length) note('移動先としての作業があります。移動者と人工配分が未確認のため、移動分だけ自動加算を保留しています。');
      if (!workers.size && own.length && !entries.length) note('作業者の記録を確認してください。記入者を作業者として勝手に加算しません。');
    } else {
      const field = kind === 'vehicle' ? 'vehicles' : 'machines';
      const rates = kind === 'vehicle' ? data.vehicleRates : data.equipmentRates;
      const used = new Map();
      own.forEach(r => list(raw(r)[field]).forEach(v => {
        const label = named(v), k = assetKey(label); if (!k) return;
        if (!used.has(k)) used.set(k, {label, reports: []});
        used.get(k).reports.push(r);
      }));
      used.forEach(({label, reports: rs}, k) => {
        const moved = kind === 'vehicle' && rs.some(r => list(raw(r).siteMoves).some(m => assetKey(m.vehicle) === k));
        const otherUse = others.some(r => list(raw(r)[field]).some(v => assetKey(v) === k)) || (kind === 'vehicle' && incoming.some(m => assetKey(m.vehicle) === k));
        if (moved || otherUse) {note(label + 'は同日に複数現場の使用・移動があります。日額を重複加算せず、配分するまで自動加算を保留しています。'); return;}
        const rate = findRate(rates, r => assetKey(r.label) === k, label); if (!rate) return;
        const gross = rateValue(rate, 'daily_rate', label); if (gross === null) return;
        let fuel = 0, fuelCount = 0;
        own.forEach(r => list(raw(r).fuels).filter(f => ['軽油', 'ガソリン'].includes(f.type) && assetKey(f.asset) === k).forEach(f => {
          const n = fuelAmount(f);
          if (n === null || n < 0) {note(label + 'の給油額が未入力です。該当する燃料差引額は未計上です。'); return;}
          fuel = round(fuel + n); fuelCount++;
        }));
        entries.push({code: rate.code, label: rate.label, used: true, dayRate: gross,
          recordedFuel: fuel, fuelCount, manualGross: null, manualFuel: null, memo: ''});
        sheet.gross_total = round(sheet.gross_total + gross);
        sheet.fuel_deduction_total = round(sheet.fuel_deduction_total + fuel);
        if (fuel > gross) note(label + 'は記録した給油額が日額を上回ります。差引額はマイナスのまま計算し、燃料費を1回だけ別計上しています。まとめ給油の配分は必要時に調整してください。');
      });
      own.forEach(r => list(raw(r).fuels).forEach(f => {
        if (!used.has(assetKey(f.asset)) && list(rates).some(rate => assetKey(rate.label) === assetKey(f.asset))) note(String(f.asset) + 'は給油記録だけで使用記録がありません。日額は追加せず、燃料欄だけ反映しています。');
      }));
      if (kind === 'vehicle' && incoming.some(m => m.vehicle)) note('移動先の車両代・燃料の配分が未確認です。移動元と重複しないよう、移動分だけ自動加算を保留しています。');
      sheet.net_total = round(sheet.gross_total - sheet.fuel_deduction_total);
    }
    return {sheet, issues: [...issues]};
  }

  /** Saved adjustments take priority; otherwise derive display-only daily estimates. */
  function analyze(data, site) {
    const reports = uniqueReports(data.reports), own = reports.filter(r => r.site_id === site.id);
    const byDay = new Map(), warnings = new Set();
    const day = date => {
      if (!byDay.has(date)) byDay.set(date, {date, labor: 0, vehicle: 0, equipment: 0, fuel: 0, waste: 0, transport: 0, other: 0, revenue: 0, pending: [], stale: [], unknown: 0});
      return byDay.get(date);
    };
    const needed = {labor: new Set(), vehicle: new Set(), equipment: new Set()};
    const vehicleKeys = new Set(list(data.vehicleRates).map(r => assetKey(r.label)));
    const equipmentKeys = new Set(list(data.equipmentRates).map(r => assetKey(r.label)));
    const expenses = {fuel: {value: 0, count: 0, missing: 0}, waste: {value: 0, count: 0, missing: 0}, transport: {value: 0, count: 0, missing: 0}, other: {value: 0, count: 0, missing: 0}};
    const addExpense = (kind, value, date) => {
      const e = expenses[kind]; e.count++;
      if (value === null) {e.missing++; day(date).unknown++;}
      else {e.value = round(e.value + value); day(date)[kind] = round(day(date)[kind] + value);}
    };
    const writerCounts = new Map(), fuelFingerprints = new Map(), transportFingerprints = new Map();
    own.forEach(r => {
      const date = r.report_date, d = r.report_data || {};
      day(date); needed.labor.add(date);
      if (list(d.vehicles).length) needed.vehicle.add(date);
      if (list(d.machines).length) needed.equipment.add(date);
      if (d.date && d.date !== date) warnings.add(date + '：日報内の日付と保存日が違います。');
      if (d.site && normal(d.site) !== normal(site.name)) warnings.add(date + '：日報内の現場名と紐付け先が違います。');
      const writer = normal(d.writer || r.recorder_name), wk = date + ':' + writer;
      writerCounts.set(wk, (writerCounts.get(wk) || 0) + 1);
      if (writer && writerCounts.get(wk) > 1) warnings.add(date + '：同じ記入者の日報が複数あります。現場移動・燃料・経費の重複を確認してください。自動削除はしません。');
      list(d.vehicles).forEach(v => {if (!vehicleKeys.has(assetKey(v))) warnings.add(date + '：単価未登録の車両があります。');});
      list(d.machines).forEach(m => {if (!equipmentKeys.has(assetKey(m))) warnings.add(date + '：単価未登録の重機があります。');});
      list(d.fuels).forEach(f => {
        const n = fuelAmount(f), k = assetKey(f.asset);
        addExpense('fuel', n, date);
        if (vehicleKeys.has(k)) needed.vehicle.add(date);
        if (equipmentKeys.has(k)) needed.equipment.add(date);
        const fp = JSON.stringify([date, k, f.type, f.source, f.outlet, f.qty ?? f.liters, n]);
        if (fuelFingerprints.has(fp) && fuelFingerprints.get(fp) !== r.id) warnings.add(date + '：複数日報に同じ給油内容があります。燃料の二重記録を確認してください。');
        fuelFingerprints.set(fp, r.id);
      });
      list(d.items).forEach(x => {
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
        const kind = x.isWaste || String(x.name || '').startsWith('産廃：') ? 'waste' : 'other';
        // `price` in the existing daily report is a row TOTAL, not a unit price.
        addExpense(kind, amount(x.price), date);
        if (kind === 'waste' && (amount(x.qty ?? x.quantity) === null || !x.unit)) warnings.add(date + '：産廃に数量・単位の未入力があります。');
        if (kind === 'other' && /人件費|常用|車両費|重機費|燃料|給油|高速|交通費/.test(String(x.name || ''))) warnings.add(date + '：日報の経費と人件費・車両費等で同じ費用を重ねていないか確認してください。');
      });
      if (list(d.siteMoves).length) warnings.add(date + '：現場移動あり。人工・車両・重機・燃料の現場間配分は管理者の確認が必要です。');
      if (list(d.leaseVehicles).length || list(d.leaseMachines).length || list(d.leaseAttachments).length) warnings.add(date + '：リースの記録があります。リース代は専用欄から自動加算しません。日報の経費に含めたか確認してください。');
      if (/給油|リッター|リットル|軽油|ガソリン|運搬|回送|高山/.test(String(d.memo || ''))) warnings.add(date + '：メモの給油・運搬等は自動で金額にしません。燃料・経費欄の記録を確認してください。');
    });
    reports.forEach(r => list(r.report_data?.siteMoves).forEach(m => {
      if (m?.site !== site.name || r.site_id === site.id) return;
      day(r.report_date); needed.labor.add(r.report_date);
      if (m.vehicle) needed.vehicle.add(r.report_date);
      warnings.add(r.report_date + '：別現場からの移動記録があります。移動元の燃料・経費は自動移し替えしていません。');
    }));
    const categories = {};
    const configs = [['labor', 'laborSheets'], ['vehicle', 'vehicleSheets'], ['equipment', 'equipmentSheets']];
    configs.forEach(([kind, source]) => {
      const stored = list(data[source]).filter(s => s.site_id === site.id);
      const autoDates = [], reviewDates = [], saved = [...stored], dateMap = new Map();
      [...needed[kind]].sort().forEach(date => {
        if (stored.some(s => s.work_date === date)) return;
        const derived = automaticSheet(kind, date, data, site, reports);
        saved.push(derived.sheet); autoDates.push(date);
        if (derived.issues.length) {reviewDates.push(date); derived.issues.forEach(w => warnings.add(w));}
      });
      let sum = 0, gross = 0, deduction = 0, revenue = 0;
      const staleDates = [];
      saved.forEach(s => {
        if (dateMap.has(s.work_date)) throw new Error('同じ日・現場の費用保存が複数あります。合計は表示しません。');
        dateMap.set(s.work_date, s);
        const n = requiredAmount(kind === 'labor' ? s.cost_total : s.net_total);
        if (kind !== 'labor') {
          const g = requiredAmount(s.gross_total), f = requiredAmount(s.fuel_deduction_total);
          if (Math.abs(round(g - f) - n) > 0.005) throw new Error('保存済みの燃料差引計算が一致しません。');
          gross = round(gross + g); deduction = round(deduction + f);
          const matchingKeys = new Set(list(s.entries).filter(e => e.used).map(e => assetKey(e.label)));
          const recorded = own.filter(r => r.report_date === s.work_date).flatMap(r => list(r.report_data?.fuels))
            .filter(fuel => ['軽油', 'ガソリン'].includes(fuel.type) && matchingKeys.has(assetKey(fuel.asset)))
            .reduce((total, fuel) => round(total + (fuelAmount(fuel) ?? 0)), 0);
          if (Math.abs(recorded - f) > 0.005) warnings.add(s.work_date + '：保存した燃料差引額と日報の給油額が違います。手入力の配分・二重控除を確認してください。');
        } else {const v = requiredAmount(s.revenue_total); revenue = round(revenue + v); day(s.work_date).revenue = v;}
        sum = round(sum + n); day(s.work_date)[kind] = n;
        const current = (kind === 'labor' ? own : reports).filter(r => r.report_date === s.work_date);
        if (sig(s.source_reports) !== sig(current)) {staleDates.push(s.work_date); day(s.work_date).stale.push(kind);}
        if (list(s.review_warnings).length) warnings.add(s.work_date + '：保存時の重複・配分等の注意事項があります。費用の確認画面で見直せます。');
        if (!own.some(r => r.report_date === s.work_date)) warnings.add(s.work_date + '：費用は保存されていますが、この現場の日報がありません。');
      });
      const missingDates = [...needed[kind]].filter(date => !dateMap.has(date)).sort();
      missingDates.forEach(date => day(date).pending.push(kind));
      categories[kind] = {value: sum, gross, deduction, revenue, savedDays: stored.length, autoDates, reviewDates, missingDates, staleDates};
    });
    const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({...d, subtotal: round(d.labor + d.vehicle + d.equipment + d.fuel + d.waste + d.transport + d.other)}));
    const subtotal = round(categories.labor.value + categories.vehicle.value + categories.equipment.value + expenses.fuel.value + expenses.waste.value + expenses.transport.value + expenses.other.value);
    const partial = Object.values(categories).some(c => c.missingDates.length || c.staleDates.length) || Object.values(expenses).some(e => e.missing) || warnings.size > 0;
    return {categories, expenses, days, subtotal, partial, warnings: [...warnings], reportCount: own.length, hasData: byDay.size > 0};
  }
  const engine = Object.freeze({analyze, automaticSheet, periodBounds, amount, fuelAmount, signature: sig});
  if (typeof module === 'object' && module.exports) {module.exports = engine; return;}
  if (window.__toyaSiteFinancialSummaryV1) return;
  window.__toyaSiteFinancialSummaryV1 = true;
  window.ToyaSiteCostSummaryEngine = engine;
  const q = selector => document.querySelector(selector);
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const yen = n => Number(n).toLocaleString('ja-JP', {maximumFractionDigits: 2}) + '円';
  const names = {labor: '人件費・常用費（交通費込）', vehicle: '車両費（燃料差引後）', equipment: '重機費（燃料差引後）'};
  const identity = () => typeof cloudProfile !== 'undefined' && cloudProfile?.role === 'admin' && cloudProfile.active === true && cloudProfile.company_id && typeof cloudClient !== 'undefined' && cloudClient ? cloudProfile.id + ':' + cloudProfile.company_id : '';
  const visible = () => !!q('#homePage')?.classList.contains('active');
  const todayLocal = () => typeof today === 'function' ? today() : new Date().toLocaleDateString('sv-SE');
  let owner = '', token = 0, runningKey = '', completedKey = '', pendingTimer, selectObserver;
  const currentKey = () => [identity(), q('#siteSummarySelect')?.value, q('#sfMode')?.value, q('#sfMonth')?.value, q('#sfDay')?.value].join('|');
  const status = text => {if (q('#sfStatus')) q('#sfStatus').textContent = text;};
  function clear() {
    token++; owner = ''; completedKey = ''; runningKey = '';
    q('#sfPanel')?.remove(); selectObserver?.disconnect(); selectObserver = null;
  }
  function mount() {
    const next = identity();
    if (!next) {if (owner) clear(); return false;}
    if (owner !== next) {clear(); owner = next;}
    const card = q('#siteSummaryCard');
    if (!card) return false;
    if (!q('#sfStyle')) {
      const style = document.createElement('style'); style.id = 'sfStyle';
      style.textContent = '#sfPanel{margin-top:14px;border-top:2px solid #eee;padding-top:14px}#sfPanel h3{font-size:18px;margin:0 0 10px}#sfPanel .sf-period{display:grid;grid-template-columns:1fr 1fr;gap:8px}#sfPanel input,#sfPanel select{width:100%;min-width:0;box-sizing:border-box;font-size:16px}#sfPanel input[type=month]{min-height:44px;border:1px solid #bbb;border-radius:9px;padding:10px;background:#fff;color:#111}#sfPanel [hidden]{display:none!important}#sfPanel .sf-total{background:#111;color:#fff;border-radius:12px;padding:16px;margin:12px 0}#sfPanel .sf-total strong{display:block;color:var(--lime,#b8ff00);font-size:30px;margin:5px 0}#sfPanel .sf-total small{display:block;line-height:1.7;color:#ddd}#sfPanel .sf-line{border-bottom:1px solid #e5e5e5;padding:12px 0}#sfPanel .sf-line-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-weight:800}#sfPanel .sf-line-head span:last-child{font-size:18px}#sfPanel .sf-note{font-size:12px;line-height:1.7;color:#666;margin-top:4px}#sfPanel .sf-alert{padding:12px;background:#fff3d8;color:#714300;border-radius:10px;line-height:1.7}#sfPanel summary{cursor:pointer;font-weight:800;padding:12px 0}#sfPanel .sf-day{padding:10px;border:1px solid #ddd;border-radius:9px;margin:8px 0}#sfLegacyDetails>summary{cursor:pointer;font-weight:800;padding:14px 0;font-size:14px}#sfPanel .sf-button{width:100%;margin-top:10px}';
      document.head.appendChild(style);
    }
    if (!q('#sfPanel')) {
      const panel = document.createElement('div'); panel.id = 'sfPanel';
      panel.innerHTML = '<h3>現場原価・自動計算</h3><p class="sf-note">日報から自動計算します。日ごとの費用保存は不要です。保存済みの調整額は優先し、未記録・配分不明の費用だけ要確認にします。</p><div class="sf-period"><div><label for="sfMode">集計期間</label><select id="sfMode"><option value="month">月ごと</option><option value="day">1日だけ</option><option value="all">全期間</option></select></div><div><label id="sfPeriodLabel" for="sfMonth">対象月</label><input id="sfMonth" type="month"><input id="sfDay" type="date" hidden></div></div><button id="sfRefresh" class="btn dark sf-button" type="button">集計を更新</button><p id="sfStatus" class="note" role="status" aria-live="polite">現場を選んでください。</p><div id="sfResult"></div>';
      const body = q('#siteSummaryBody'); card.insertBefore(panel, q('#sfLegacyDetails') || (body?.parentElement === card ? body : null));
      q('#sfMonth').value = todayLocal().slice(0, 7); q('#sfDay').value = todayLocal();
      q('#sfMode').addEventListener('change', () => {const mode = q('#sfMode').value; q('#sfMonth').hidden = mode !== 'month'; q('#sfDay').hidden = mode !== 'day'; q('#sfPeriodLabel').hidden = mode === 'all'; q('#sfPeriodLabel').textContent = mode === 'day' ? '作業日' : '対象月'; q('#sfPeriodLabel').htmlFor = mode === 'day' ? 'sfDay' : 'sfMonth'; invalidate();});
      ['sfMonth', 'sfDay'].forEach(id => q('#' + id).addEventListener('change', invalidate));
      q('#sfRefresh').addEventListener('click', () => refresh(true));
      // Keep the existing detail node/handlers. No changes to their calculations.
      if (body && !q('#sfLegacyDetails')) {const detail = document.createElement('details'); detail.id = 'sfLegacyDetails'; const s = document.createElement('summary'); s.textContent = '日報の稼働・産廃の明細（従来表示・全期間）'; detail.appendChild(s); body.before(detail); detail.appendChild(body);}
      const select = q('#siteSummarySelect');
      if (select) {select.removeEventListener('change', invalidate); select.addEventListener('change', invalidate); selectObserver = new MutationObserver(() => {if (currentKey() !== completedKey && currentKey() !== runningKey) schedule();}); selectObserver.observe(select, {childList: true, subtree: true});}
    }
    return true;
  }
  function invalidate() {token++; completedKey = ''; runningKey = ''; if (q('#sfRefresh')) q('#sfRefresh').disabled = false; if (q('#sfResult')) q('#sfResult').innerHTML = ''; status('条件が変わりました。読み込みます。'); schedule();}
  function schedule(force = false) {clearTimeout(pendingTimer); pendingTimer = setTimeout(() => {if (visible()) refresh(force);}, 220);}
  async function readAll(table, fields, company, bounds, dateField, siteId, ticket) {
    const out = [], pageSize = 500;
    for (let offset = 0; offset < 100000; offset += pageSize) {
      if (ticket !== token || !identity() || owner !== identity()) throw new Error('集計条件が変わりました。');
      let query = cloudClient.from(table).select(fields).eq('company_id', company);
      if (siteId) query = query.eq('site_id', siteId);
      if (dateField && bounds.start) query = query.gte(dateField, bounds.start).lt(dateField, bounds.end);
      const response = await query.order('id').range(offset, offset + pageSize - 1);
      if (response.error) throw new Error(table + '：' + response.error.message);
      const page = response.data || []; out.push(...page);
      if (page.length < pageSize) return out;
    }
    throw new Error('集計件数が多いため、期間を短くしてください。途中の合計は表示しません。');
  }
  function line(label, value, note) {return '<div class="sf-line"><div class="sf-line-head"><span>' + escape(label) + '</span><span>' + escape(value) + '</span></div><div class="sf-note">' + escape(note) + '</div></div>';}
  function render(result, site, label) {
    if (!result.hasData) {status(site.name + ' ／ ' + label + ' ／ 記録なし'); q('#sfResult').innerHTML = '<div class="sf-alert">この期間の日報・保存済み費用はありません。実際に費用が0円だったという意味ではありません。</div>'; return;}
    let html = '<div class="sf-total"><div>' + '自動計算の原価小計（概算）' + '</div><strong>' + yen(result.subtotal) + '</strong><small>' + (result.partial ? '入力済みの人数・使用車両・重機を自動計算済み。通勤台数や現場移動などの要確認分・未入力費用は含まれない場合があります。' : '日報×登録単価と入力済み費用の合計です。保存済みの調整額を優先しています。未記入の費用は含みません。') + '</small></div>';
    Object.entries(result.categories).forEach(([kind, c]) => {
      const value = !c.savedDays && !c.autoDates.length ? '使用・費用記録なし' : yen(c.value) + (c.reviewDates.length ? '［要確認］' : '');
      const note = ['自動計算 ' + c.autoDates.length + '日', '保存額を優先 ' + c.savedDays + '日', c.reviewDates.length ? '一部費用の要確認 ' + c.reviewDates.length + '日' : '', c.staleDates.length ? '保存後の日報変更 ' + c.staleDates.length + '日（保存額を保持）' : ''].filter(Boolean).join(' ／ ');
      html += line(names[kind], value, note);
    });
    [['fuel', '燃料・油脂（日報の記録分）'], ['waste', '処分費（日報の記録分）'], ['transport', '重機回送費（自動計算・手入力）'], ['other', '材料・その他経費（日報）']].forEach(([kind, label]) => {
      const e = result.expenses[kind];
      html += line(label, e.missing === e.count && e.count ? '金額未入力' : e.count ? yen(e.value) : '記録なし', e.count + '件' + (e.missing ? ' ／ 金額未入力 ' + e.missing + '件は小計に含めていません。' : ''));
    });
    const pending = Object.entries(result.categories).filter(([, c]) => c.reviewDates.length).map(([kind, c]) => names[kind].replace('（燃料差引後）', '') + c.reviewDates.length + '日');
    if (pending.length) html += '<p class="sf-alert">一部費用の要確認：' + escape(pending.join('・')) + '。計算できる分はすでに小計へ反映済みです。通勤台数や現場間の配分など、不明な分だけ確認・調整してください。通常の日は費用保存なしで表示します。</p>';
    if (result.categories.labor.revenue) html += line('常用に行く分の売上（原価と別）', yen(result.categories.labor.revenue), 'この売上は上の原価小計へ加算・相殺していません。');
    html += '<details><summary>計算方法・燃料の二重計上防止</summary><p class="sf-note">人件費（登録単価×日報人数、保存額があればそちらを優先）＋車両費の燃料差引後＋重機費の燃料差引後＋日報の燃料・油脂＋処分費＋重機回送費＋その他経費。差引前の日額に燃料を重ねて足しません。日報の「記録済み経費」は内訳が重なるため、さらに加算しません。</p><p class="sf-note">車両：差引前 ' + yen(result.categories.vehicle.gross) + ' − 差引燃料 ' + yen(result.categories.vehicle.deduction) + '。重機：差引前 ' + yen(result.categories.equipment.gross) + ' − 差引燃料 ' + yen(result.categories.equipment.deduction) + '。</p><p class="sf-note">自社は同じ日・現場の同じ人を1回だけ、車両・重機も1台につき日額1回で仮計算します。8〜12時間の時間帯が記録された日報は1日勤務として計算し、それ以外の勤務区分・半日・現場間配分は要確認とします。明建・朝日の通勤費・高速代は日報の専用欄から人件費内へ1回だけ加算します。市内は台数×登録単価、市外・特別料金は入力合計額です。半日でも通勤費は半額にしません。未記録の通勤台数を人数から推測しません。常用の来る/行くも日報だけで判定できないため保存・調整分を優先します。給油額は当日の消費額とは限りません。回送は日報の専用欄に追加した重機1台・片道回数×現行登録単価で計算し、手入力の合計額（0円も含む）を優先します。運搬会社へ支払う回送費から自社燃料代を差し引きません。メモだけの金額、未入力の回送・リース・小型機械費などは自動加算しません。各入力額をそのまま合算し、消費税は新たに加算・税別換算しません。給与や決算用の実費集計ではなく、登録した社内単価による原価の目安です。</p></details>';
    html += '<details><summary>日別の内訳・自動計算を確認（' + result.days.length + '日）</summary>' + result.days.map(d => '<div class="sf-day"><b>' + escape(d.date) + '　小計 ' + yen(d.subtotal) + '</b><div class="sf-note">' + ['labor', 'vehicle', 'equipment'].map(kind => names[kind].replace('（燃料差引後）', '') + '：' + yen(d[kind]) + (result.categories[kind].autoDates.includes(d.date) ? '［自動］' : '［保存額］') + (result.categories[kind].reviewDates.includes(d.date) ? '［一部要確認］' : '') + (d.stale.includes(kind) ? '［日報変更・要確認］' : '')).join(' ／ ') + '<br>燃料 ' + yen(d.fuel) + ' ／ 処分費 ' + yen(d.waste) + ' ／ 回送費 ' + yen(d.transport) + ' ／ その他 ' + yen(d.other) + (d.unknown ? '<br>金額未入力 ' + d.unknown + '件' : '') + '</div></div>').join('') + '</details>';
    if (result.warnings.length) html += '<details><summary>要確認の記録（' + result.warnings.length + '件）</summary><div class="sf-alert">' + result.warnings.map(escape).join('<br><br>') + '</div></details>';
    q('#sfResult').innerHTML = html;
    status(site.name + ' ／ ' + label + ' ／ 日報' + result.reportCount + '件を確認。更新 ' + new Date().toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}));
  }
  async function refresh(force = false) {
    if (!mount() || !visible()) return;
    const k = currentKey(); if (!force && (k === runningKey || k === completedKey)) return;
    const siteName = q('#siteSummarySelect')?.value;
    if (!siteName) {q('#sfResult').innerHTML = ''; status('上の欄で現場を選んでください。'); return;}
    const mine = owner, ticket = ++token; runningKey = k;
    q('#sfResult').innerHTML = ''; status('保存済み費用と日報を読み込み中…'); q('#sfRefresh').disabled = true;
    try {
      const mode = q('#sfMode').value, value = mode === 'day' ? q('#sfDay').value : q('#sfMonth').value;
      const bounds = periodBounds(mode, value), company = cloudProfile.company_id;
      const sites = await readAll('sites', 'id,name,status', company, {}, null, null, ticket);
      const matches = sites.filter(s => s.name === siteName);
      if (matches.length !== 1) throw new Error('現場名を一意に確認できません。登録を確認してください。');
      const site = matches[0];
      const definitions = [
        ['reports', 'daily_reports', 'id,site_id,report_date,recorder_name,report_data,updated_at', 'report_date', null],
        ['laborSheets', 'labor_cost_sheets', 'id,site_id,work_date,cost_total,revenue_total,source_reports,updated_at', 'work_date', site.id],
        ['vehicleSheets', 'vehicle_cost_sheets', 'id,site_id,work_date,entries,gross_total,fuel_deduction_total,net_total,source_reports,review_warnings,updated_at', 'work_date', site.id],
        ['equipmentSheets', 'equipment_cost_sheets', 'id,site_id,work_date,entries,gross_total,fuel_deduction_total,net_total,source_reports,review_warnings,updated_at', 'work_date', site.id],
        ['laborRates', 'labor_rate_master', 'id,code,label,kind,day_rate,half_rate,city_per_vehicle,active', null, null],
        ['vehicleRates', 'vehicle_rate_master', 'id,code,label,daily_rate,active', null, null],
        ['equipmentRates', 'equipment_rate_master', 'id,code,label,daily_rate,active', null, null],
        ['transportRates', 'equipment_transport_rate_master', 'id,carrier,machine_name,distance_label,unit_price,price_basis,active', null, null]
      ];
      const values = await Promise.all(definitions.map(([, table, fields, df, sid]) => readAll(table, fields, company, bounds, df, sid, ticket)));
      if (ticket !== token || owner !== mine || identity() !== mine || currentKey() !== k) return;
      const data = Object.fromEntries(definitions.map(([name], i) => [name, values[i]]));
      render(analyze(data, site), site, mode === 'all' ? '全期間' : mode === 'month' ? value + '月分' : value);
      completedKey = k;
    } catch (e) {
      if (ticket === token && owner === mine && identity() === mine) {q('#sfResult').innerHTML = ''; status('集計できませんでした：' + e.message + '。0円としては表示していません。');}
    } finally {if (ticket === token && owner === mine) {runningKey = ''; if (q('#sfRefresh')) q('#sfRefresh').disabled = false;}}
  }
  function start() {
    mount(); schedule();
    const logged = q('#cloudLoggedIn'); if (logged) new MutationObserver(() => {mount(); schedule();}).observe(logged, {attributes: true, attributeFilter: ['style']});
    document.addEventListener('click', e => {if (e.target.closest?.('nav [data-page="homePage"]')) {mount(); schedule(true);}});
    window.addEventListener('pageshow', () => {mount(); schedule(true);});
    document.addEventListener('visibilitychange', () => {if (!document.hidden) {mount(); schedule(true);}});
    let attempts = 0; const initial = setInterval(() => {if (mount()) schedule(); if (owner || ++attempts >= 30) clearInterval(initial);}, 1000);
    // Refresh while the home is visible, at most once a minute. No auth/client or DB writes.
    setInterval(() => {if (!document.hidden && visible() && identity() && !runningKey) schedule(true);}, 60000);
    // Identity check only: never signs out or creates an auth client.
    setInterval(() => {if (owner && identity() !== owner) clear();}, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
