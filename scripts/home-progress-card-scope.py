from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'docs/company-monthly-summary.progress-r2.js'
s=p.read_text()
old=' const q=s=>document.querySelector(s);'
new=" const q=s=>/^#cm[A-Z]/.test(s)?(card?.querySelector(s)||null):document.querySelector(s);"
assert s.count(old)==1
p.write_text(s.replace(old,new,1))
print('Home progress selectors are scoped to their own card; unrelated setup fields untouched.')
