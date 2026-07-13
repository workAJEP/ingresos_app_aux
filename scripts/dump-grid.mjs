import fs from 'fs';
import * as XLSX from 'xlsx';
const f = process.argv[2];
const wb = XLSX.read(fs.readFileSync(f), { type: 'buffer' });
console.log('SHEETS:', wb.SheetNames.join(' | '));
for (const sn of wb.SheetNames) {
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '', raw: true, blankrows: false });
  console.log(`--- sheet "${sn}" filas: ${grid.length}`);
  grid.forEach((r, i) => {
    const t = r.map(x => String(x).trim()).filter(Boolean).join(' § ');
    if (t && (i < 40 || /[A-Za-z]{4,}/.test(t) && !/^\d/.test(t))) console.log(i, '|', t.slice(0, 180));
  });
}
