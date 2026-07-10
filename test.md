// =======================================================
// 1. CONSTANTES DE COLUMNAS EXACTAS 
// =======================================================
const COL_PIEZA       = 0;  // Columna A: Pieza
const COL_COD_DIST    = 1;  // Columna B: Codigo Dist
const COL_NOMBRE      = 2;  // Columna C: Nombre
const COL_COLOR       = 3;  // Columna D: Color
const COL_COMPOSICION = 4;  // Columna E: Composicion
const COL_BARCODE     = 10; // Columna K: Numero
const COL_PESO_NETO   = 13; // Columna N: Peso Neto kg
const COL_METROS      = 25; // Columna Z: Cantidad en Metros
const COL_YARDAS      = 26; // Columna AA: Cantidad en Yardas

// Columnas de estados al final de la tabla
const COL_ESTADO       = 27; // Columna AB: Estado Actual
const COL_FECHA_Z14    = 28; // Columna AC: Confirmacion Ingreso Bodega Z14
const COL_FECHA_PILOTO = 29; // Columna AD: Confirmacion Piloto
const COL_FECHA_XENA   = 30; // Columna AE: Confirmacion Bodega Xena
const COL_EXTRA_INFO   = 31; // Columna AF: Extra Información

// =======================================================
// 2. FUNCIONES AUXILIARES GLOBALES
// =======================================================
function getNextRow(sheet, col) { return sheet.getLastRow() + 1; }
function fmtNum(num) { return isNaN(Number(num)) ? "0.00" : Number(num).toFixed(2); }

// =======================================================
// 3. FUNCIÓN DE ARRANQUE Y NOMBRE
// =======================================================
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('Trazabilidad Logística Sourcing')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function obtenerNombreHojaCalculo() {
  try { return SpreadsheetApp.getActiveSpreadsheet().getName(); } 
  catch(e) { return "Documento de Logística"; }
}

// =======================================================
// 4. LÓGICA MAESTRA (ESCÁNER / MANUAL INDIVIDUAL)
// =======================================================
function ejecutarFlujoZ14(barcodeValue, fase) {
  try {
    if (!barcodeValue) return { status: "error", msg: "Código vacío." };
    let cadenaOriginal = String(barcodeValue).toUpperCase().replace(/[\r\n\t\s]+/g, "");
    if (cadenaOriginal === "") return { status: "error", msg: "Código vacío." };
    if (cadenaOriginal.length < 7) return { status: "error", msg: "El código es muy corto. Verifica la lectura." };

    let codigoBusqueda = cadenaOriginal;
    let extraInfoValor = "";

    if (cadenaOriginal.length >= 10) {
      codigoBusqueda = cadenaOriginal.slice(0, -2);
      extraInfoValor = cadenaOriginal.slice(-2); 
    } else {
      codigoBusqueda = cadenaOriginal;
      extraInfoValor = "";
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const destinoSheet = ss.getSheetByName("Confirmacion de Ingreso");
    const impresionSheet = ss.getSheetByName("Impresion Guia");
    const nombresOrigen = ["Packing List Ecuador", "Packing List Santista"];

    if (!destinoSheet || !impresionSheet) return { status: "error", msg: "Falta pestaña Confirmacion de Ingreso o Impresion Guia." };
    if (destinoSheet.getLastColumn() < 32 || destinoSheet.getRange(1, COL_EXTRA_INFO + 1).getValue() === "") {
      destinoSheet.getRange(1, COL_EXTRA_INFO + 1).setValue("Extra Información");
    }

    const timestampObj = new Date();
    const timestamp = Utilities.formatDate(timestampObj, "GMT-6", "yyyy-MM-dd HH:mm:ss");
    const hoyStr = Utilities.formatDate(timestampObj, "GMT-6", "yyyy-MM-dd");
    const proximaFilaDestino = getNextRow(destinoSheet, "A"); 

    let indexFila = -1;
    const maxRow = destinoSheet.getLastRow();
    if (maxRow > 1) {
      const destinoCodigos = destinoSheet.getRange(2, COL_BARCODE + 1, maxRow - 1, 1).getValues().flat();
      indexFila = destinoCodigos.map(s => String(s).toUpperCase().replace(/[\r\n\t\s]+/g, "")).indexOf(codigoBusqueda);
    }

    if (fase === "ingreso") {
      if (indexFila !== -1) return { status: "warning", msg: "⚠️ RECHAZADO: El código " + codigoBusqueda + " ya fue registrado." };

      let filaEncontrada = null;
      let totalEnOrigenGlobal = 0;
      let origenDataCompleta = [];
      let proveedorIdentificado = "";

      for (let nombreHoja of nombresOrigen) {
        let hojaOrigen = ss.getSheetByName(nombreHoja);
        if (hojaOrigen) {
          let data = hojaOrigen.getDataRange().getValues();
          data.shift(); 
          let dataFiltrada = data.filter(fila => String(fila[COL_BARCODE]).replace(/[\r\n\t\s]+/g, "") !== "");
          totalEnOrigenGlobal += dataFiltrada.length; 
          
          if (!filaEncontrada) {
            let encontrada = dataFiltrada.find(fila => {
               let codigoExcel = String(fila[COL_BARCODE]).toUpperCase().replace(/[\r\n\t\s]+/g, "");
               return codigoExcel === codigoBusqueda;
            });
            if (encontrada) {
              filaEncontrada = encontrada;
              origenDataCompleta = dataFiltrada; 
              proveedorIdentificado = nombreHoja.replace("Packing List ", ""); 
            }
          }
        }
      }

      if (!filaEncontrada) return { status: "error", msg: `❌ No encontramos el código: "${codigoBusqueda}" en los Packing Lists.` };

      let filaCompleta = new Array(32).fill("");
      for(let i = 0; i <= 26; i++) filaCompleta[i] = filaEncontrada[i] !== undefined ? filaEncontrada[i] : "";
      
      filaCompleta[COL_ESTADO] = "EN BODEGA"; 
      filaCompleta[COL_FECHA_Z14] = timestamp;   
      filaCompleta[COL_FECHA_PILOTO] = "";          
      filaCompleta[COL_FECHA_XENA] = "";          
      filaCompleta[COL_EXTRA_INFO] = extraInfoValor; 

      destinoSheet.getRange(proximaFilaDestino, 1, 1, 32).setValues([filaCompleta]);

      const destinoDataAct = destinoSheet.getDataRange().getValues();
      destinoDataAct.shift();
      const totalIngresadosGlobal = destinoDataAct.length;
      const faltanGlobal = totalEnOrigenGlobal - totalIngresadosGlobal;

      const codigoDistActual = String(filaEncontrada[COL_COD_DIST]).trim();
      const totalArticuloOrigen = origenDataCompleta.filter(fila => String(fila[COL_COD_DIST]).trim() === codigoDistActual).length;
      const yaEscaneadosArticulo = destinoDataAct.filter(fila => String(fila[COL_COD_DIST]).trim() === codigoDistActual).length;
      const textoConteo = filaEncontrada[COL_PIEZA] + " / " + totalArticuloOrigen;

      const filaImpresion = [
        "", proveedorIdentificado, filaEncontrada[COL_COMPOSICION], filaEncontrada[COL_NOMBRE],      
        filaEncontrada[COL_COD_DIST], filaEncontrada[COL_COLOR], textoConteo, filaEncontrada[COL_BARCODE],     
        filaEncontrada[COL_PESO_NETO], filaEncontrada[COL_YARDAS], "PRODUCCION", codigoBusqueda                    
      ];
      impresionSheet.getRange(getNextRow(impresionSheet, "A"), 1, 1, 12).setValues([filaImpresion]);

      return { status: "success", msg: "Ingreso Exitoso en Z14", detalles: { codigo: codigoBusqueda, estado: "EN BODEGA", pieza: filaEncontrada[COL_PIEZA], codigoDist: filaEncontrada[COL_COD_DIST], metros: fmtNum(filaEncontrada[COL_METROS]), yardas: fmtNum(filaEncontrada[COL_YARDAS]), ingresadosArticulo: yaEscaneadosArticulo, totalArticulo: totalArticuloOrigen, globalIngresados: totalIngresadosGlobal, globalTotal: totalEnOrigenGlobal, globalFaltan: faltanGlobal } };
    }

    if (indexFila === -1) return { status: "error", msg: "❌ RECHAZADO: Este rollo no ha ingresado a la Bodega Z14." };

    const filaAEditar = indexFila + 2;
    const estadoActual = String(destinoSheet.getRange(filaAEditar, COL_ESTADO + 1).getValue()).trim();
    const piezaInfo = destinoSheet.getRange(filaAEditar, COL_PIEZA + 1).getValue();
    const codDistInfo = destinoSheet.getRange(filaAEditar, COL_COD_DIST + 1).getValue();
    const metrosInfo = fmtNum(destinoSheet.getRange(filaAEditar, COL_METROS + 1).getValue());
    const yardasInfo = fmtNum(destinoSheet.getRange(filaAEditar, COL_YARDAS + 1).getValue());

    if (fase === "piloto") {
      if (estadoActual === "EN TRÁNSITO") return { status: "info", msg: "Este bulto ya está en camino." };
      if (estadoActual === "RECIBIDO XENA COJ") return { status: "info", msg: "Este bulto ya fue entregado a Xena Coj." };
      if (estadoActual !== "EN BODEGA") return { status: "error", msg: "Estado inválido: " + estadoActual };

      destinoSheet.getRange(filaAEditar, COL_ESTADO + 1).setValue("EN TRÁNSITO");
      destinoSheet.getRange(filaAEditar, COL_FECHA_PILOTO + 1).setValue(timestamp);

      const dataDestino = destinoSheet.getDataRange().getValues();
      dataDestino.shift();
      const formatFechaStr = (d) => (d instanceof Date) ? Utilities.formatDate(d, "GMT-6", "yyyy-MM-dd") : String(d).substring(0, 10);
      const cargadosHoy = dataDestino.filter(row => { return formatFechaStr(row[COL_FECHA_PILOTO]) === hoyStr && String(row[COL_ESTADO]).trim() === "EN TRÁNSITO"; }).length;

      return { status: "success", msg: "Rollo asignado a ruta", detalles: { codigo: codigoBusqueda, estado: "EN TRÁNSITO", pieza: piezaInfo, codigoDist: codDistInfo, metros: metrosInfo, yardas: yardasInfo, cargadosHoy: cargadosHoy }};
    }

    if (fase === "xena") {
      if (estadoActual === "RECIBIDO XENA COJ") return { status: "info", msg: "Este rollo ya está almacenado aquí." };
      if (estadoActual !== "EN TRÁNSITO") return { status: "error", msg: "Rechazado. El piloto no reportó tránsito." };

      destinoSheet.getRange(filaAEditar, COL_ESTADO + 1).setValue("RECIBIDO XENA COJ");
      destinoSheet.getRange(filaAEditar, COL_FECHA_XENA + 1).setValue(timestamp);

      const dataDestino = destinoSheet.getDataRange().getValues();
      dataDestino.shift();
      const formatFechaStr = (d) => (d instanceof Date) ? Utilities.formatDate(d, "GMT-6", "yyyy-MM-dd") : String(d).substring(0, 10);
      
      let totalRecibidosXena = 0; let recibidosHoyXena = 0;
      dataDestino.forEach(row => {
          if (String(row[COL_ESTADO]).trim() === "RECIBIDO XENA COJ") {
              totalRecibidosXena++;
              if (formatFechaStr(row[COL_FECHA_XENA]) === hoyStr) recibidosHoyXena++;
          }
      });
      return { status: "success", msg: "Recepción Exitosa", detalles: { codigo: codigoBusqueda, estado: "RECIBIDO XENA", pieza: piezaInfo, codigoDist: codDistInfo, metros: metrosInfo, yardas: yardasInfo, totalRecibidos: totalRecibidosXena, recibidosHoy: recibidosHoyXena }};
    }

  } catch (error) { return { status: "error", msg: "Error de ejecución: " + error.message }; }
}

// =======================================================
// 5. NUEVO: RECEPCIÓN MASIVA POR LISTA (XENA)
// =======================================================
function obtenerListaTransitoXena() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Confirmacion de Ingreso");
    if (!sheet) return { error: true, msg: "Falta pestaña Confirmacion de Ingreso." };
    
    const data = sheet.getDataRange().getValues();
    data.shift();
    let enTransito = [];
    
    data.forEach(row => {
      if (String(row[COL_ESTADO]).trim() === "EN TRÁNSITO") {
        enTransito.push({
          codigo: String(row[COL_BARCODE]),
          pieza: String(row[COL_PIEZA]),
          codigoDist: String(row[COL_COD_DIST]), // <-- AÑADIDO CÓDIGO DIST
          metros: fmtNum(row[COL_METROS]),
          yardas: fmtNum(row[COL_YARDAS])
        });
      }
    });
    
    return { error: false, data: enTransito };
  } catch (e) { return { error: true, msg: e.message }; }
}

function procesarRecepcionMasivaXena(codigosArray) {
  try {
    if (!codigosArray || codigosArray.length === 0) return { error: true, msg: "No hay bultos seleccionados." };
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Confirmacion de Ingreso");
    const maxRow = sheet.getLastRow();
    if (maxRow < 2) return { error: true, msg: "La base de datos está vacía." };
    
    // Obtenemos todos los datos para reescribir rápidamente
    const range = sheet.getRange(2, 1, maxRow - 1, 32);
    const data = range.getValues();
    const timestamp = Utilities.formatDate(new Date(), "GMT-6", "yyyy-MM-dd HH:mm:ss");
    
    const targetCodes = codigosArray.map(c => String(c).toUpperCase().replace(/[\r\n\t\s]+/g, ""));
    let bultosRecibidos = 0;
    
    for (let i = 0; i < data.length; i++) {
        let rowCode = String(data[i][COL_BARCODE]).toUpperCase().replace(/[\r\n\t\s]+/g, "");
        let estado = String(data[i][COL_ESTADO]).trim();
        
        if (targetCodes.includes(rowCode) && estado === "EN TRÁNSITO") {
            data[i][COL_ESTADO] = "RECIBIDO XENA COJ";
            data[i][COL_FECHA_XENA] = timestamp;
            bultosRecibidos++;
        }
    }
    
    if (bultosRecibidos > 0) {
        range.setValues(data); // Escribimos todo de golpe (súper rápido)
    }
    
    return { error: false, msg: `✅ Se han recibido correctamente ${bultosRecibidos} bultos en la bodega Xena Coj.` };
  } catch (e) { return { error: true, msg: e.message }; }
}

// =======================================================
// 6. DASHBOARD Y MANIFIESTO
// =======================================================
function obtenerDatosDashboard() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Confirmacion de Ingreso");
    const data = sheet.getDataRange().getValues();
    data.shift(); 
    
    let stats = { enBodegaZ14: 0, enviadosHoy: 0, recibidosHoyXena: 0, totalXena: 0 };
    let payload = [];
    const hoyStr = Utilities.formatDate(new Date(), "GMT-6", "yyyy-MM-dd");
    const formatFechaStr = (d) => (d instanceof Date) ? Utilities.formatDate(d, "GMT-6", "yyyy-MM-dd") : String(d).substring(0, 10);
    
    data.forEach((row, index) => {
      let estado = String(row[COL_ESTADO]).trim();
      let fechaPiloto = row[COL_FECHA_PILOTO] ? formatFechaStr(row[COL_FECHA_PILOTO]) : "";
      let fechaXena = row[COL_FECHA_XENA] ? formatFechaStr(row[COL_FECHA_XENA]) : "";
      
      if (estado === "EN BODEGA") stats.enBodegaZ14++;
      if (estado === "EN TRÁNSITO" && fechaPiloto === hoyStr) stats.enviadosHoy++;
      if (estado === "RECIBIDO XENA COJ") { stats.totalXena++; if (fechaXena === hoyStr) stats.recibidosHoyXena++; }
      
      if (estado !== "") {
        payload.push({ id: index + 2, codigo: String(row[COL_BARCODE] || ""), metros: fmtNum(row[COL_METROS]), yardas: fmtNum(row[COL_YARDAS]), estado: estado });
      }
    });
    return { error: false, stats: stats, data: payload.reverse() };
  } catch (e) { return { error: true, msg: e.message }; }
}

function obtenerManifiestoHTML() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Confirmacion de Ingreso");
    if (!sheet) return { error: true, msg: "Falta pestaña Confirmacion de Ingreso." };
    
    const data = sheet.getDataRange().getValues();
    data.shift(); 
    
    const hoyStr = Utilities.formatDate(new Date(), "GMT-6", "yyyy-MM-dd");
    const formatFechaStr = (d) => (d instanceof Date) ? Utilities.formatDate(d, "GMT-6", "yyyy-MM-dd") : String(d).substring(0, 10);
    
    let html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; padding: 10px; color: #333;">
        <h2 style="text-align:center; margin-bottom: 5px; color: #111;">MANIFIESTO DE CARGA - RUTA PILOTO</h2>
        <p style="text-align:center; margin-top: 0; font-size: 14px; color: #666;"><b>Fecha de Emisión:</b> ${hoyStr} | <b>Zona Horaria:</b> GMT-6</p>
        
        <table style="width:100%; border-collapse: collapse; font-size: 11px; margin-top: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" border="1" cellpadding="6" cellspacing="0">
          <thead>
            <tr style="background-color: #343a40; color: #ffffff; text-align: center; font-weight: bold;">
              <th style="padding: 8px; border: 1px solid #dee2e6;">Pieza</th>
              <th style="padding: 8px; border: 1px solid #dee2e6;">Código Dist</th>
              <th style="padding: 8px; border: 1px solid #dee2e6;">Nombre</th>
              <th style="padding: 8px; border: 1px solid #dee2e6;">Color</th>
              <th style="padding: 8px; border: 1px solid #dee2e6;">Composición</th>
              <th style="padding: 8px; border: 1px solid #dee2e6;">Número (ID)</th>
              <th style="padding: 8px; border: 1px solid #dee2e6;">Peso Neto (kg)</th>
              <th style="padding: 8px; border: 1px solid #dee2e6;">Cant. Metros</th>
              <th style="padding: 8px; border: 1px solid #dee2e6;">Cant. Yardas</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    let count = 0, totalMetrosAcum = 0, totalYardasAcum = 0, totalPesoAcum = 0;

    data.forEach(row => {
       let estado = String(row[COL_ESTADO]).trim();
       let fechaPiloto = row[COL_FECHA_PILOTO] ? formatFechaStr(row[COL_FECHA_PILOTO]) : "";
       
       if (estado === "EN TRÁNSITO" && fechaPiloto === hoyStr) {
         let pesoNum = isNaN(Number(row[COL_PESO_NETO])) ? 0 : Number(row[COL_PESO_NETO]);
         let metrosNum = isNaN(Number(row[COL_METROS])) ? 0 : Number(row[COL_METROS]);
         let yardasNum = isNaN(Number(row[COL_YARDAS])) ? 0 : Number(row[COL_YARDAS]);

         totalPesoAcum += pesoNum; totalMetrosAcum += metrosNum; totalYardasAcum += yardasNum;

         html += `
           <tr style="text-align: center; background-color: ${count % 2 === 0 ? '#ffffff' : '#f8f9fa'};">
             <td style="padding: 6px; border: 1px solid #dee2e6; font-weight: 600;">${row[COL_PIEZA]}</td>
             <td style="padding: 6px; border: 1px solid #dee2e6;">${row[COL_COD_DIST]}</td>
             <td style="padding: 6px; border: 1px solid #dee2e6; text-align: left;">${row[COL_NOMBRE]}</td>
             <td style="padding: 6px; border: 1px solid #dee2e6;">${row[COL_COLOR]}</td>
             <td style="padding: 6px; border: 1px solid #dee2e6; text-align: left;">${row[COL_COMPOSICION]}</td>
             <td style="padding: 6px; border: 1px solid #dee2e6; font-family: monospace; font-size: 12px; background-color: #f1f3f5;"><b>${row[COL_BARCODE]}</b></td>
             <td style="padding: 6px; border: 1px solid #dee2e6;">${fmtNum(row[COL_PESO_NETO])}</td>
             <td style="padding: 6px; border: 1px solid #dee2e6; font-weight: 500;">${fmtNum(row[COL_METROS])} Mts</td>
             <td style="padding: 6px; border: 1px solid #dee2e6; font-weight: 500;">${fmtNum(row[COL_YARDAS])} Yds</td>
           </tr>
         `;
         count++;
       }
    });
    
    html += `
          <tr style="background-color: #e9ecef; font-weight: bold; text-align: center;">
            <td colspan="6" style="padding: 8px; border: 1px solid #dee2e6; text-align: right; font-size: 12px;">TOTALES GENERALES:</td>
            <td style="padding: 8px; border: 1px solid #dee2e6; color: #495057;">${totalPesoAcum.toFixed(2)} kg</td>
            <td style="padding: 8px; border: 1px solid #dee2e6; color: #007bff;">${totalMetrosAcum.toFixed(2)} Mts</td>
            <td style="padding: 8px; border: 1px solid #dee2e6; color: #fd7e14;">${totalYardasAcum.toFixed(2)} Yds</td>
          </tr>
        </tbody>
      </table>
      
      <div style="margin-top: 20px; font-size: 12px; display: flex; justify-content: space-between; background: #f8f9fa; padding: 10px; border-radius: 6px; border: 1px solid #dee2e6;">
        <div><b>Total de Bultos/Rollos Cargados:</b> <span style="font-size: 14px; color: #28a745;">${count}</span></div>
        <div style="text-align: right; color: #666; font-style: italic;">Sourcing Logistics App</div>
      </div>
    </div>`;
    
    if (count === 0) return { error: true, msg: "No hay rollos cargados en tránsito el día de hoy para generar el manifiesto." };
    
    return { error: false, html: html };
  } catch (e) { return { error: true, msg: "Error: " + e.message }; }
}