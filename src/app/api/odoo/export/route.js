// GET /api/odoo/export?tipo=guia|inventario&importacionId= — CSV UTF-8 BOM, attachment.
//
// `guia`: 12 columnas EXACTAS del GAS original (test.md, hoja "Impresion
// Guia"): ['', proveedor, composicion, nombre, cod_dist, color,
// 'pieza / totalArticulo', barcode, peso_neto, yardas, 'PRODUCCION', barcode].
// En el GAS la columna "proveedor" venía del nombre de la hoja de origen del
// packing list (Ecuador/Santista); ese concepto ya no existe por fila —
// usamos el proveedor del EXPEDIENTE (partner_origen_id) como equivalente.
// `inventario`: export propio (no congelado por el plan) con todos los
// campos del rollo, para auditoría/backup.
import { odooSearchRead } from '@/lib/odoo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvEscape(v) {
  const s = v === undefined || v === null || v === false ? '' : String(v);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo') === 'inventario' ? 'inventario' : 'guia';
    const importacionId = searchParams.get('importacionId');

    const domain = [['estado', '!=', 'pendiente']];
    if (importacionId) domain.push(['importacion_id', '=', Number(importacionId)]);

    const fields = [
      'importacion_id', 'pieza', 'cod_dist', 'nombre', 'color', 'composicion',
      'barcode', 'peso_neto', 'metros', 'yardas', 'estado',
      'fecha_z14', 'fecha_piloto', 'fecha_xena',
      'operador_z14', 'operador_piloto', 'operador_xena',
    ];

    const rollos = await odooSearchRead(
      'distefano.importacion.rollo',
      domain,
      fields,
      5000,
      0,
      'fecha_z14 asc',
    );

    const impIds = [...new Set(rollos.map((r) => (Array.isArray(r.importacion_id) ? r.importacion_id[0] : r.importacion_id)).filter(Boolean))];
    let proveedorPorImp = {};
    if (impIds.length) {
      const imps = await odooSearchRead(
        'distefano.importacion',
        [['id', 'in', impIds]],
        ['partner_origen_id'],
        impIds.length,
      );
      proveedorPorImp = Object.fromEntries(
        imps.map((i) => [i.id, Array.isArray(i.partner_origen_id) ? i.partner_origen_id[1] : '']),
      );
    }

    const fecha = new Date().toISOString().slice(0, 10);
    let filename;
    let lines;

    if (tipo === 'inventario') {
      filename = `inventario_${fecha}.csv`;
      const header = [
        'Pieza', 'Codigo Dist', 'Nombre', 'Color', 'Composicion', 'Barcode',
        'Peso Neto', 'Metros', 'Yardas', 'Estado', 'Expediente',
        'Fecha Z14', 'Fecha Piloto', 'Fecha Xena', 'Operador Z14', 'Operador Piloto', 'Operador Xena',
      ];
      lines = [
        header,
        ...rollos.map((r) => [
          r.pieza,
          r.cod_dist,
          r.nombre,
          r.color,
          r.composicion,
          r.barcode,
          r.peso_neto,
          r.metros,
          r.yardas,
          r.estado,
          Array.isArray(r.importacion_id) ? r.importacion_id[1] : '',
          r.fecha_z14 || '',
          r.fecha_piloto || '',
          r.fecha_xena || '',
          r.operador_z14 || '',
          r.operador_piloto || '',
          r.operador_xena || '',
        ]),
      ];
    } else {
      filename = `guia_${fecha}.csv`;
      const totalesPorArticulo = {};
      for (const r of rollos) {
        const impId = Array.isArray(r.importacion_id) ? r.importacion_id[0] : r.importacion_id;
        const key = `${impId}|${r.cod_dist}`;
        totalesPorArticulo[key] = (totalesPorArticulo[key] || 0) + 1;
      }
      lines = rollos.map((r) => {
        const impId = Array.isArray(r.importacion_id) ? r.importacion_id[0] : r.importacion_id;
        const key = `${impId}|${r.cod_dist}`;
        return [
          '',
          proveedorPorImp[impId] || '',
          r.composicion,
          r.nombre,
          r.cod_dist,
          r.color,
          `${r.pieza} / ${totalesPorArticulo[key] || 1}`,
          r.barcode,
          r.peso_neto,
          r.yardas,
          'PRODUCCION',
          r.barcode,
        ];
      });
    }

    const BOM = '﻿';
    const csv = BOM + toCsv(lines);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[export]', err instanceof Error ? err.message : err);
    return new Response('No se pudo generar el archivo de exportación.', { status: 503 });
  }
}
