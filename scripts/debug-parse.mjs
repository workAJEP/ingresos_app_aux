import fs from 'fs';
import path from 'path';
import { parseExcel, parseGrid } from '../src/lib/parseExcel.js';
import { parsePdf } from '../src/lib/parsePdf.js';

const dir = 'docs/examples';
for (const f of fs.readdirSync(dir)) {
  const buf = fs.readFileSync(path.join(dir, f));
  console.log('\n========== ' + f + ' ==========');
  try {
    const r = f.toLowerCase().endsWith('.pdf') ? await parsePdf(buf) : parseExcel(buf);
    console.log('meta:', JSON.stringify(r.meta));
    console.log('rows:', r.rows.length, 'sinBarcode:', r.descartadasSinBarcode, 'dup:', r.duplicadasEnArchivo);
    const nombres = [...new Set(r.rows.map(x=>x.nombre))];
    const colores = [...new Set(r.rows.map(x=>x.color))];
    console.log('nombres distintos:', nombres.length, JSON.stringify(nombres.slice(0,8)));
    console.log('colores distintos:', colores.length, JSON.stringify(colores.slice(0,8)));
    const stats = k => r.rows.filter(x=>!x[k]).length;
    console.log('vacios -> peso:', stats('peso_neto'), 'yardas:', stats('yardas'), 'metros:', stats('metros'), 'nombre:', stats('nombre'), 'color:', stats('color'));
    console.log('muestra:', JSON.stringify(r.rows.slice(0,3), null, 1));
  } catch (e) { console.log('ERROR:', e.message); }
}
