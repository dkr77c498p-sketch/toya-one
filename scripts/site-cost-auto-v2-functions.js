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
        if (counts.length !== 1 || !fullDay(working.map(x => x.r))) {note(label + 'の人数・勤務区分が一定でありません。この会社の人工は要確認です。'); return;}
        const rate = findRate(data.laborRates, r => r.kind === 'dispatch' && r.code === code, label); if (!rate) return;
        const value = rateValue(rate, 'day_rate', label); if (value === null) return;
        const cost = round(value * counts[0]);
        entries.push({key: code, label, kind: 'dispatch', full: counts[0], half: 0, cost});
        sheet.cost_total = round(sheet.cost_total + cost);
        note(label + 'の人件費は自動計算済み。通勤台数・市内/市外・高速代は日報に記録がないため含めていません（交通費等のみ要確認）。');
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
