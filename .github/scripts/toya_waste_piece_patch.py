from pathlib import Path
import re


def replace_once(s, before, after):
    assert s.count(before) == 1, (before[:100], s.count(before))
    return s.replace(before, after, 1)


def patch(root):
    root = Path(root)
    p = root / 'waste-price-master.js'
    s = p.read_text()
    s = replace_once(s, '（税別） v1.1', '（税別） v1.2 kg小数単価・枚対応')
    s = replace_once(s,
        "  const yen = (n) => '¥' + Math.round(Number(n || 0)).toLocaleString();",
        "  const yen = (n) => '¥' + Math.round(Number(n || 0)).toLocaleString();\n  // Unit prices retain decimals; final yen amounts keep the existing rounding.\n  const unitYen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP', {maximumFractionDigits: 6});")
    assert s.count('yen(r.unit_price)') == 3
    s = s.replace('yen(r.unit_price)', 'unitYen(r.unit_price)')
    s = replace_once(s,
        '<option value="vehicle">台</option></select></div>',
        '<option value="vehicle">台</option><option value="piece">枚</option></select></div>')
    start = s.index('  function wpmSetAllowedUnit(r){')
    end = s.index('\n  function wpmCalcAmount(', start)
    s = s[:start] + '''  function wpmSetAllowedUnit(r){
    const unit = document.getElementById('wpmQtyUnit');
    const qty = document.getElementById('wpmQty');
    if(!unit || !r) return;
    const allowed = r.rate_basis === 'kg' ? [['kg','kg'],['t','t']]
      : r.rate_basis === 'm3' ? [['m3','m³']]
      : r.rate_basis === 'piece' ? [['piece','枚']]
      : r.rate_basis === 'vehicle' ? [['vehicle','台']] : [];
    // Preserve kg/t when changing quantity or a unit; do not reset the selection.
    const previous = unit.value;
    const html = allowed.map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
    if(unit.dataset.rateBasis !== r.rate_basis){
      unit.innerHTML = html;
      unit.dataset.rateBasis = r.rate_basis;
    }
    unit.value = allowed.some(([value]) => value === previous) ? previous : (allowed[0]?.[0] || '');
    if(qty) qty.step = r.rate_basis === 'piece' ? '1' : '0.1';
  }
''' + s[end:]
    s = replace_once(s,
        "    const basisText = r.rate_basis === 'kg' ? 'kg' : r.rate_basis === 'm3' ? 'm³' : (r.vehicle_class ? `${r.vehicle_class} 1台` : '1台');",
        "    const basisText = r.rate_basis === 'kg' ? 'kg' : r.rate_basis === 'm3' ? 'm³' : r.rate_basis === 'piece' ? '1枚' : (r.vehicle_class ? `${r.vehicle_class} 1台` : '1台');")
    s = replace_once(s,
        '    add.disabled = !(qty > 0);',
        "    const valid = Number.isFinite(qty) && qty > 0 && !!unitEl.value && (r.rate_basis !== 'piece' || Number.isInteger(qty));\n    add.disabled = !valid;\n    if(r.rate_basis === 'piece' && qty > 0 && !Number.isInteger(qty)) box.innerHTML += '<div class=\"cloud-bad\">枚数は1枚単位で入力してください。</div>';")
    s = replace_once(s,
        "    if(!(qty > 0)) return alert('数量を入力してください。');",
        "    if(!Number.isFinite(qty) || !(qty > 0) || !unitEl.value) return alert('数量を入力してください。');\n    if(r.rate_basis === 'piece' && !Number.isInteger(qty)) return alert('枚数は1枚単位で入力してください。');")
    s = replace_once(s,
        "const reportUnit = unitEl.value === 'm3' ? 'm³' : unitEl.value === 'vehicle' ? '台' : unitEl.value;",
        "const reportUnit = unitEl.value === 'm3' ? 'm³' : unitEl.value === 'vehicle' ? '台' : unitEl.value === 'piece' ? '枚' : unitEl.value;")
    p.write_text(s)

    p = root / 'waste-price-admin.js'
    s = p.read_text()
    unchanged_tail = s[s.index('/* TOYA_ATTACHMENT_ADMIN_CONTROLS_V1 */'):]
    s = replace_once(s, '/* TOYA One 廃材単価 登録管理 v1.0 */', '/* TOYA One 廃材単価 登録管理 v1.1 枚単価対応 */')
    s = replace_once(s,
        '<option value="vehicle">車両1台</option>',
        '<option value="vehicle">車両1台</option><option value="piece">枚</option>')
    s = replace_once(s,
        '<option value="vehicle" ${r.rate_basis===\'vehicle\'?\'selected\':\'\'}>車両1台</option>',
        '<option value="vehicle" ${r.rate_basis===\'vehicle\'?\'selected\':\'\'}>車両1台</option><option value="piece" ${r.rate_basis===\'piece\'?\'selected\':\'\'}>枚</option>')
    s = replace_once(s,
        "if(!display) display = basis==='kg' ? '1kg' : basis==='m3' ? '1m³' : (vehicle ? `${vehicle} 1台` : '1台');",
        "if(!display) display = basis==='kg' ? '1kg' : basis==='m3' ? '1m³' : basis==='piece' ? '1枚' : (vehicle ? `${vehicle} 1台` : '1台');")
    s = replace_once(s, '例：1kg / 1m³ / 10tダンプ 1台', '例：1kg / 1m³ / 1枚 / 10tダンプ 1台')
    assert s[s.index('/* TOYA_ATTACHMENT_ADMIN_CONTROLS_V1 */'):] == unchanged_tail
    p.write_text(s)

    p = root / 'index.html'
    old = p.read_text()
    s = replace_once(old,
        '<script src="waste-price-master.js?v=20260908-1200"></script>',
        '<script src="waste-price-master.js?v=20260908-shori-v1"></script>')
    s = replace_once(s,
        '<script src="waste-price-admin.js?v=20260908-1155"></script>',
        '<script src="waste-price-admin.js?v=20260908-shori-v1"></script>')
    # No inline script, authentication code, or form markup may change.
    inline = lambda text: re.findall(r'<script>([\s\S]*?)</script>', text)
    assert inline(old) == inline(s)
    assert sum(a != b for a,b in zip(old.splitlines(), s.splitlines())) == 2
    p.write_text(s)

if __name__ == '__main__':
    import sys
    patch(sys.argv[1])
