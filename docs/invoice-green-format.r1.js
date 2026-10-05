/* TOYA invoice paper format, approved 2026-10-05. Display-only: no network,
 * storage, financial calculations or changes to the source document object. */
(function(root){
 'use strict';
 const MM=96/25.4;
 const css=`
 .te2-frame.invoice-document{--invoice-green:#008537}
 .invoice-document .invoice-header{position:relative;grid-template-columns:99mm 90mm;column-gap:5mm;padding-top:16mm;min-height:65mm}
 .invoice-document .invoice-recipient{padding:1mm 3mm 0 2mm}
 .invoice-document .invoice-recipient-address{font-size:9pt;min-height:9mm;margin-bottom:1.5mm}
 .invoice-document .invoice-customer{font-size:15pt;line-height:1.4;border-bottom:.25mm solid var(--invoice-green);padding-bottom:2mm}
 .invoice-document .invoice-terms{font-size:7.5pt;padding-top:1.5mm}
 .invoice-document .invoice-greeting{font-size:10pt;margin:6mm 0 2mm}
 .invoice-document .invoice-grand{width:94mm;max-width:100%;min-height:12mm;padding:1.5mm 3mm;border:.45mm solid var(--invoice-green);border-radius:2.5mm;font-size:11pt;justify-content:space-between;gap:2mm}
 .invoice-document .invoice-grand strong{font-size:14pt;font-weight:500}
 .invoice-document .invoice-grand strong:before{content:'¥ ';font-size:12pt}
 .invoice-document .invoice-title-row{position:static;min-height:0;margin:0}
 .invoice-document .invoice-title-row h1{position:absolute;top:0;left:50%;transform:translateX(-50%);width:59mm;min-height:12mm;padding:1mm 0 1mm .35em;display:flex;align-items:center;justify-content:center;font-size:21pt;font-weight:600;letter-spacing:.35em;line-height:1;border:.5mm solid var(--invoice-green);border-radius:2.5mm;color:#006528}
 .invoice-document .invoice-title-row h1.invoice-progress-title{width:67mm;font-size:16pt;letter-spacing:.15em;padding-left:.15em}
 .invoice-document .invoice-date{position:absolute;right:0;top:1.5mm;font-size:8pt;max-width:53mm;white-space:normal}
 .invoice-document .invoice-state{font-size:8pt;font-weight:bold}
 .invoice-document .invoice-identity{gap:3mm;min-height:28mm}
 .invoice-document .invoice-logo{width:24mm;height:28mm}
 .invoice-document .invoice-company{font-size:7.8pt;line-height:1.45}
 .invoice-document .invoice-company-name{font-size:12pt;line-height:1.45;letter-spacing:.04em}
 .invoice-document .invoice-contacts{font-size:7.8pt;white-space:normal;margin:1.5mm 0 1mm}
 .invoice-document .invoice-bank{font-size:7.6pt;line-height:1.45}
 .invoice-document .invoice-bank-note{font-size:6.5pt;line-height:1.4}
 .invoice-document .invoice-project{padding:1.5mm 2mm 1mm;min-height:8mm}
 .invoice-document .invoice-project b{font-size:8.5pt}
 .invoice-document .invoice-progress th,.invoice-document .invoice-progress td{border-color:var(--invoice-green);font-size:8pt}
 .invoice-document .invoice-lines{border-color:var(--invoice-green);border-top-width:.4mm;border-left-width:.4mm;border-radius:2.5mm 2.5mm 0 0;margin-top:2mm}
 .invoice-document .invoice-lines th,.invoice-document .invoice-lines td{border-color:var(--invoice-green)}
 .invoice-document .invoice-lines th{height:8.5mm;font-size:10pt;color:#006528;background:#f0f7f1;font-weight:500;letter-spacing:.15em;white-space:normal;line-height:1.25}
 .invoice-document .invoice-lines td{height:8.5mm;font-size:9pt;line-height:1.4;padding:1mm 1.5mm}
 .invoice-document .invoice-lines td:nth-child(4),.invoice-document .invoice-lines td:nth-child(5){font-size:9pt}
 .invoice-document .invoice-lines small{font-size:7.5pt}
 .invoice-document .invoice-lines th:last-child,.invoice-document .invoice-lines td:last-child{border-right-width:.4mm}
 .invoice-document .invoice-blank td{font-size:0;line-height:0;padding:0}
 .invoice-document .invoice-totals{border-left:.4mm solid var(--invoice-green);border-radius:0 0 2.5mm 2.5mm}
 .invoice-document .invoice-totals th,.invoice-document .invoice-totals td{height:12mm;border-color:var(--invoice-green);border-bottom-width:.4mm;padding:1mm;font-size:10pt}
 .invoice-document .invoice-totals th{font-size:9pt;color:#006528;background:#f0f7f1}
 .invoice-document .invoice-totals td:last-child{border-right-width:.4mm;font-weight:600}
 .invoice-document .invoice-tax-detail{font-size:6.5pt;line-height:1.4}
 .invoice-document .invoice-notes{font-size:8pt;line-height:1.4}
 .invoice-document .invoice-void{font-size:8pt}
 .invoice-document .bb-continuation{border-color:var(--invoice-green)}
 @media print{.invoice-document{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
 `;
 function prepare(parsed){
  for(const doc of parsed){
   const body=doc.querySelector('.invoice-document');if(!body)continue;
   // Old compact forms add a fixed small number of empty rows. Replace only
   // those placeholders; every real item and its printed values are retained.
   body.querySelectorAll('.invoice-lines .invoice-blank').forEach(r=>r.remove());
   const head=body.querySelector('.invoice-lines thead th');if(head)head.textContent='商品コード／商品名';
   const columns=body.querySelectorAll('.invoice-lines col');
   [36,11,7,15,16,15].forEach((w,j)=>{if(columns[j])columns[j].style.width=w+'%';});
   const sums=body.querySelector('.invoice-totals');
   if(sums){
    sums.querySelectorAll('td[aria-hidden="true"]').forEach(c=>c.remove());
    const group=sums.querySelector('colgroup');if(group){group.replaceChildren();for(const w of [13,19,15,19,12,22]){const col=doc.createElement('col');col.style.width=w+'%';group.append(col);}}
   }
  }
 }
 function finish(doc,pages){
  for(const item of pages){
   const page=item.page,inner=page.querySelector('.te2-frame.invoice-document');if(!inner)continue;
   const table=inner.querySelector('.invoice-lines'),tbody=table?.querySelector('tbody');if(!tbody)continue;
   const bottom=()=>inner.getBoundingClientRect().bottom;
   const limit=page.getBoundingClientRect().bottom-12*MM-1.5;
   let room=limit-bottom();if(room<=1)continue;
   const min=8.5*MM,n=Math.min(40,Math.floor(room/min));
   for(let j=0;j<n;j++){const row=doc.createElement('tr');row.className='invoice-blank';row.setAttribute('aria-hidden','true');for(let k=0;k<6;k++)row.append(doc.createElement('td'));tbody.append(row);}
   // Distribute the remaining space evenly as extra row height. Existing text
   // sets a minimum height; it is never cropped or shrunk to hide overflow.
   const rows=[...tbody.rows];room=limit-bottom();if(rows.length&&room>1){const extra=room/rows.length;for(const row of rows){const height=row.getBoundingClientRect().height+extra;for(const cell of row.cells)cell.style.height=height.toFixed(3)+'px';}}
   // Fractional table rounding differs between WebKit and Chromium. A small
   // correction leaves a safe paper margin without an extra trailing page.
   const overflow=bottom()-limit;
   if(overflow>0&&rows.length){const correction=(overflow+1)/rows.length;for(const row of rows)for(const cell of row.cells)if(cell.style.height)cell.style.height=Math.max(min,parseFloat(cell.style.height)-correction).toFixed(3)+'px';}
  }
 }
 root.ToyaInvoiceGreenFormat=Object.freeze({css,prepare,finish});
})(window);
