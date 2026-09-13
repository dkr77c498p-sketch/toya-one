const assert=require('node:assert/strict'),P=require('../docs/site-project-profile-engine.js');
assert.equal(P.sqmToTsubo(100),'30.25');
assert.equal(P.tsuboToSqm(30.25),'100');
assert.deepEqual(P.totals([{amount:800000},{amount:3200000}],4000000),{total:4000000,difference:0,matches:true});
assert.deepEqual(P.totals([{amount:800000}],4000000),{total:800000,difference:3200000,matches:false});
assert.equal(P.sqmToTsubo(''),'');
console.log('PASS area conversion and contract breakdown totals');
