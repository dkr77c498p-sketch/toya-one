"""Build schema-only bootstrap from reviewed PostgreSQL catalog metadata (never row data)."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'infrastructure/schema-catalog.json').read_text());s=data['schema'];funcs=data['functions']
def ident(x):return '"'+x.replace('"','""')+'"'
def table(x):return '.'.join(ident(v) for v in (x.split('.') if '.' in x else ['public',x]))
def role(x):return 'PUBLIC' if x.lower()=='public' else ident(x)
out=["-- Empty independent sales database only. No users, companies, records, photos or master rows are copied.","begin;", "do $$begin if to_regclass('public.companies') is not null or exists(select 1 from auth.users) or exists(select 1 from storage.objects) then raise exception '空の販売用プロジェクト以外には適用できません。';end if;end $$;", "create schema if not exists private;", "revoke all on schema private from PUBLIC,anon;", "grant usage on schema private to authenticated,service_role;", "set local search_path=public,extensions,pg_catalog;", "set local check_function_bodies=false;"]
for t in s['tables']:
 name=ident(t['schema'])+'.'+ident(t['name']);out.append('create table '+name+' (\n'+t['columns']+'\n);')
 if t['rls']:out.append('alter table '+name+' enable row level security;')
for c in s['constraints']:
 if c['type'] in ['p','u']:out.append('alter table '+table(c['table'])+' add constraint '+ident(c['name'])+' '+c['definition']+';')
for f in funcs:out.append(f['definition'].rstrip().rstrip(';')+';')
for c in s['constraints']:
 if c['type'] not in ['p','u']:out.append('alter table '+table(c['table'])+' add constraint '+ident(c['name'])+' '+c['definition']+';')
out.extend(i.rstrip(';')+';' for i in s['indexes'])
for v in s['views']:
 out.append('create view '+ident(v['schema'])+'.'+ident(v['name'])+' with ('+','.join(v['options'] or ['security_invoker=true'])+') as '+v['definition'].rstrip(';')+';')
out.extend(t.rstrip(';')+';' for t in s['triggers'])
for p in s['policies']:
 sql='create policy '+ident(p['policyname'])+' on '+ident(p['schemaname'])+'.'+ident(p['tablename'])+' as '+p['permissive']+' for '+p['cmd']+' to '+','.join(role(r) for r in p['roles'])
 if p['qual']:sql+=' using ('+p['qual']+')'
 if p['with_check']:sql+=' with check ('+p['with_check']+')'
 out.append(sql+';')
for t in s['tables']+s['views']:out.append('revoke all on '+ident(t['schema'])+'.'+ident(t['name'])+' from PUBLIC,anon,authenticated,service_role;')
for g in s['grants']:
 if g['role'] in ['PUBLIC','anon','authenticated'] and g['privilege'] not in ['SELECT','INSERT','UPDATE','DELETE']:continue
 out.append('grant '+g['privilege']+' on '+table(g['table'])+' to '+role(g['role'])+';')
for g in s['column_grants']:out.append('grant '+g['privilege']+' ('+ident(g['column'])+') on '+table(g['table'])+' to '+role(g['role'])+';')
for f in funcs:
 name=ident(f['schema'])+'.'+ident(f['name'])+'('+f['arguments']+')'
 out.append('revoke all on function '+name+' from PUBLIC,anon,authenticated,service_role;')
 for g in f['grants'] or []:out.append('grant execute on function '+name+' to '+role(g['role'])+';')
out.append("insert into storage.buckets(id,name,public) values('toya-photos','toya-photos',false);")
out.extend(['commit;','-- Provision the first company through verified customer onboarding after deployment.'])
(root/'infrastructure/bootstrap.sql').write_text('\n'.join(out)+'\n')
print(json.dumps({'tables':len(s['tables']),'functions':len(funcs),'policies':len(s['policies']),'business_rows':0}))
