'use strict';
module.exports=()=>({id:'synthetic-sheet',title:'参考解体工事',customer_name:'テスト見積先',site_address:'テスト工事住所',document_date:'2026-01-01',source_filename:'synthetic-quote.pdf',source_sha256:'a'.repeat(64),source_page_count:3,warnings:['単位を原本で確認'],source_summary:{quoted_total:'110000',tax_label:'税込',conditions:['別途工事は協議']},groups:[
 {name:'内部解体工事',lines:[
  {label:'床仕上撤去',section:'1階',quantity:'21.60',unit:'m²',source_unit:'ｍ2',quoted_unit_price:'2000',quoted_amount:'43200',notes:'下地別',source_page:2,row_kind:'work'},
  {label:'床下地撤去',section:'1階',quantity:'21.60',unit:'m²',source_unit:'ｍ2',quoted_unit_price:'1500',quoted_amount:null,notes:'別途',source_page:2,row_kind:'work'},
  {label:'上屋解体',section:'',quantity:'36.25',unit:'m³',source_unit:'m3',quoted_unit_price:'500',quoted_amount:'18125',notes:'',source_page:2,row_kind:'work'}]},
 {name:'運搬処分工事',lines:[
  {label:'木くず処分',section:'',quantity:'2.30',unit:'m³',source_unit:'ｍ3',quoted_unit_price:'4000',quoted_amount:'9200',notes:'',source_page:3,row_kind:'work'},
  {label:'金属くず',section:'',quantity:'0.80',unit:'t',source_unit:'ｔ',quoted_unit_price:'-35000',quoted_amount:'-28000',notes:'買取',source_page:3,row_kind:'work'},
  {label:'コンクリート処分',section:'',quantity:null,unit:'台',source_unit:'台',quoted_unit_price:'12000',quoted_amount:null,notes:'',source_page:3,row_kind:'work'}]},
 {name:'諸経費・調整',lines:[
  {label:'諸経費',quantity:'1',unit:'式',quoted_unit_price:'10000',quoted_amount:'10000',source_page:1,row_kind:'allowance'},
  {label:'値引き',quantity:'1',unit:'式',quoted_unit_price:'-2000',quoted_amount:'-2000',source_page:1,row_kind:'adjustment'}]}
]});
