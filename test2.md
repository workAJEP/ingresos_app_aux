<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trazabilidad Logística Sourcing</title>
  <script src="https://unpkg.com/html5-qrcode"></script>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    @media screen {
      body { font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #f4f7f6; margin: 0; padding: 15px; display: flex; flex-direction: column; align-items: center; }
      .container { width: 100%; max-width: 600px; background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.08); box-sizing: border-box; margin-bottom: 20px;}
      
      /* Título Dinámico */
      h2 { color: #222; text-align: center; margin: 0 0 15px 0; font-size: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
      
      label { font-weight: bold; color: #444; display: block; margin-bottom: 5px; }
      .selector-fase { width: 100%; padding: 12px; font-size: 16px; border-radius: 8px; border: 2px solid #ccc; font-weight: bold; margin-bottom: 25px; transition: all 0.3s; }
      .btn-camara { color: white; padding: 16px; border: none; border-radius: 10px; font-size: 18px; font-weight: bold; cursor: pointer; width: 100%; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
      
      .btn-secundario { color: white; padding: 12px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; width: 100%; margin-top: 15px; display: none; }
      .bg-dark { background-color: #343a40; }
      .bg-info { background-color: #17a2b8; margin-bottom: 15px;}
      
      .manual-input { display: flex; gap: 8px; margin-bottom: 10px; }
      .manual-input input { flex: 1; padding: 12px; border: 1px solid #ccc; border-radius: 6px; font-size: 15px; }
      .manual-input button { padding: 12px 15px; background-color: #28a745; color: white; border: none; border-radius: 6px; font-size: 15px; cursor: pointer; font-weight: bold; }
      
      #dashboardView { display: none; width: 100%; }
      .dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 20px; }
      .stat-card { padding: 15px; border-radius: 8px; color: white; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      .stat-card h3 { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9; }
      .stat-card p { margin: 5px 0 0 0; font-size: 24px; font-weight: bold; }
      .box-blue { background-color: #007bff; } .box-orange { background-color: #fd7e14; } .box-green { background-color: #28a745; } .box-dark { background-color: #343a40; }
      
      .chart-container { position: relative; height: 200px; width: 100%; margin-bottom: 20px; }
      .filter-container { display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap; }
      .dash-search { flex: 1; padding: 10px; border: 2px solid #17a2b8; border-radius: 6px; font-size: 14px; min-width: 150px; }
      
      .table-wrapper { overflow-x: auto; max-height: 400px; border: 1px solid #eee; border-radius: 8px; }
      .dash-table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
      .dash-table th { background-color: #f8f9fa; color: #333; padding: 10px; position: sticky; top: 0; border-bottom: 2px solid #dee2e6; }
      .dash-table td { padding: 8px; border-bottom: 1px solid #eee; }
      .badge { padding: 4px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; color: white; display: inline-block; }
      .b-bodega { background-color: #007bff; } .b-transito { background-color: #fd7e14; } .b-xena { background-color: #28a745; }

      .tabla-info { width: 100%; text-align: left; border-collapse: collapse; margin-top: 12px; font-size: 14px; }
      .tabla-info td { padding: 5px; border-bottom: 1px solid #eee; }
      .tabla-info td.titulo { font-weight: bold; color: #555; width: 35%; }
      .tabla-info td.valor { color: #000; font-weight: 600; }
      
      /* Checklist custom */
      .chk-item { padding: 12px 10px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center; transition: background 0.3s; border-radius: 6px; margin-bottom: 5px; }
      .chk-item:hover { background-color: #f8f9fa; }
      .chk-data { flex: 1; text-align: left; padding-right: 10px; }
      .btn-recibir-bulto { background-color: #28a745; color: white; border: none; padding: 10px 15px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); min-width: 120px; transition: 0.2s; }
      .btn-recibir-bulto:disabled { background-color: #6c757d !important; color: white !important; cursor: not-allowed; box-shadow: none; opacity: 0.8; }
      
      #printArea { display: none; }
    }
    @media print {
      body > :not(#printArea) { display: none !important; }
      #printArea { display: block !important; position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; background: white; }
    }
  </style>
</head>
<body>
  
  <div class="container">
    <h2 id="appMainTitle">📦 Cargando sistema...</h2>
    
    <label for="faseSelector">⚙️ SELECCIONA TU OPERACIÓN:</label>
    <select id="faseSelector" class="selector-fase" onchange="actualizarInterfaz()">
      <option value="ingreso">1. Bodega Z14 (Ingresando)</option>
      <option value="piloto">2. Piloto (Cargando Camión)</option>
      <option value="xena">3. Bodega Xena Coj (Descargando)</option>
      <option value="dash">📊 Ver Dashboard Interactivo</option>
    </select>
    
    <div id="operacionView">
      <input type="file" id="camaraNativa" accept="image/*" capture="environment" style="display: none;">
      <button id="btnListaXena" class="btn-secundario bg-info" onclick="abrirChecklistXena()">📋 Ver Recepciones Pendientes (En Vivo)</button>
      <button id="btnCamara" class="btn-camara" onclick="abrirCamaraNativa()">📸 Escanear Ingreso Z14</button>
      
      <div class="manual-input">
        <input type="text" id="manualCode" placeholder="Ingresa ID Único...">
        <button id="btnManual" onclick="enviarCodigoManual()">Ingresar</button>
      </div>
      
      <button id="btnManifiesto" class="btn-secundario bg-dark" onclick="solicitarManifiesto()">🖨️ Imprimir Manifiesto del Día</button>
    </div>

    <div id="dashboardView">
      <div class="dash-grid">
        <div class="stat-card box-blue"><h3>Rollos Faltantes de Enviar</h3><p id="stZ14">0</p></div>
        <div class="stat-card box-orange"><h3>Rollos Enviados Hoy</h3><p id="stEnv">0</p></div>
        <div class="stat-card box-green"><h3>Rollos Recibidos en Xena Hoy</h3><p id="stRecHoy">0</p></div>
        <div class="stat-card box-dark"><h3>Total de Rollos Xena</h3><p id="stXenaTot">0</p></div>
      </div>
      <div class="chart-container"><canvas id="graficoStatus"></canvas></div>
      <div class="filter-container">
        <input type="text" id="buscadordash" class="dash-search" placeholder="🔍 Buscar ID o Artículo..." onkeyup="filtrarTabla()">
        <select id="filtroEstado" class="dash-search" onchange="filtrarTabla()">
          <option value="">🎯 Todos los Estados</option>
          <option value="EN BODEGA">Faltan Enviar (En Z14)</option>
          <option value="EN TRÁNSITO">En Ruta (Piloto)</option>
          <option value="RECIBIDO XENA COJ">En Xena Coj</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table class="dash-table" id="tablaDash">
          <thead><tr><th>ID Único</th><th>Artículo</th><th>Mts</th><th>Yds</th><th>Estado</th></tr></thead>
          <tbody id="dashBody"><tr><td colspan="5" style="text-align:center;">Cargando inventario vivo...</td></tr></tbody>
        </table>
      </div>
    </div>
  </div>
  
  <div id="reader" style="display:none;"></div>
  <div id="printArea"></div>

  <script>
    let html5QrCode;
    let isProcessing = false;
    let miGrafico; 
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function generarBeep(tipo) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      if (tipo === 'success') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); gain.gain.setValueAtTime(1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      } else {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); gain.gain.setValueAtTime(1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      }
      osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.5);
    }

    // AL CARGAR LA PÁGINA: Obtiene el nombre del Excel y actualiza el Título
    window.onload = function() { 
      html5QrCode = new Html5Qrcode("reader"); 
      actualizarInterfaz(); 
      google.script.run.withSuccessHandler(nombre => {
        document.getElementById("appMainTitle").innerHTML = `📦 ${nombre}`;
        document.title = nombre;
      }).obtenerNombreHojaCalculo();
    };

    function actualizarInterfaz() {
      const fase = document.getElementById("faseSelector").value;
      const opView = document.getElementById("operacionView");
      const dashView = document.getElementById("dashboardView");
      const btnCamara = document.getElementById("btnCamara");
      const input = document.getElementById("manualCode");
      const btnManifiesto = document.getElementById("btnManifiesto");
      const btnListaXena = document.getElementById("btnListaXena");

      if (fase === "dash") {
        opView.style.display = "none"; dashView.style.display = "block";
        cargarDashboard(); return;
      } else {
        opView.style.display = "block"; dashView.style.display = "none";
      }

      btnManifiesto.style.display = "none";
      btnListaXena.style.display = "none";

      if (fase === "ingreso") { 
        btnCamara.style.backgroundColor = "#007bff"; btnCamara.innerHTML = "📸 Escanear Ingreso Z14"; input.placeholder = "ID Único para Z14...";
      } 
      else if (fase === "piloto") { 
        btnCamara.style.backgroundColor = "#fd7e14"; btnCamara.innerHTML = "🚚 Escanear Carga Piloto"; input.placeholder = "ID a despachar..."; 
        btnManifiesto.style.display = "block"; 
      } 
      else if (fase === "xena") { 
        btnCamara.style.backgroundColor = "#28a745"; btnCamara.innerHTML = "🏢 Escanear Recepción Xena"; input.placeholder = "ID descargado..."; 
        btnListaXena.style.display = "block"; 
      }
      input.focus();
    }

    // ============================================
    // LÓGICA DEL CHECKLIST EN VIVO (DOBLE CLIC DE SEGURIDAD)
    // ============================================
    function abrirChecklistXena() {
      Swal.fire({ title: 'Buscando rollos en tránsito...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      google.script.run.withSuccessHandler(res => {
        if (res.error) { return Swal.fire("Error", res.msg, "error"); }
        if (res.data.length === 0) { return Swal.fire("Todo al día", "No hay ningún rollo en ruta esperando recepción.", "info"); }
        
        window.rollosRecibidosEnVivo = 0;
        window.totalRollosEnVivo = res.data.length;

        let htmlForm = `
          <div style="background:#e9ecef; padding:15px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <button id="btnRecibirTodos" class="btn-recibir-bulto" style="background:#007bff; min-width:auto;" onclick="confirmarRecepcionTodos(this)">📥 Recibir Todos</button>
            <div style="text-align:right; line-height:1.2;">
              <span style="font-size:12px; font-weight:bold; color:#666; text-transform:uppercase;">Progreso</span><br>
              <span style="font-size:20px; font-weight:bold; color:#333;"><span id="progressCounter" style="color:#28a745;">0</span> de ${window.totalRollosEnVivo}</span>
            </div>
          </div>
          <div style="max-height: 380px; overflow-y: auto; border: 1px solid #dee2e6; padding: 5px; border-radius: 8px;">
        `;
        
        res.data.forEach(item => {
          htmlForm += `
            <div class="chk-item" id="row_${item.codigo}">
              <div class="chk-data">
                <b style="font-size:15px; color:#111;">ID: ${item.codigo}</b><br>
                <span style="color:#444; font-size:13px;">Pieza: <b>${item.pieza}</b> | Cód: <b>${item.codigoDist}</b></span><br>
                <span style="color:#777; font-size:12px;">📏 ${item.metros} Mts / ${item.yardas} Yds</span>
              </div>
              <button class="btn-recibir-bulto check-btn" id="btn_${item.codigo}" value="${item.codigo}" 
                      onclick="confirmarRecepcionIndividual(this, '${item.codigo}')">
                 📦 Recibir Rollo
              </button>
            </div>
          `;
        });
        htmlForm += `</div>`;

        Swal.fire({
          title: '🚚 Recepción de Rollos',
          html: htmlForm,
          showConfirmButton: false,
          showCancelButton: true,
          cancelButtonText: 'Cerrar Panel',
          width: '550px'
        }).then(() => document.getElementById("manualCode").focus());
      }).obtenerListaTransitoXena();
    }

    // --- SISTEMA DE CONFIRMACIÓN POR DOBLE CLIC (SIN POPUPS FEOS) ---

    function confirmarRecepcionIndividual(btn, codigo) {
      if (btn.getAttribute('data-confirming') !== 'true') {
         // Primer clic: Pedir confirmación
         btn.setAttribute('data-confirming', 'true');
         let originalText = btn.innerHTML;
         btn.setAttribute('data-orig-text', originalText);
         
         btn.innerHTML = "⚠️ Confirmar";
         btn.style.backgroundColor = "#ffc107"; // Amarillo advertencia
         btn.style.color = "#000";

         // Si no hace clic en 3 segundos, se cancela la advertencia
         setTimeout(() => {
             if(btn.getAttribute('data-confirming') === 'true' && !btn.disabled) {
                 btn.setAttribute('data-confirming', 'false');
                 btn.innerHTML = btn.getAttribute('data-orig-text');
                 btn.style.backgroundColor = "#28a745"; // Vuelve a verde
                 btn.style.color = "#fff";
             }
         }, 3000);
      } else {
         // Segundo clic: Ejecutar acción
         btn.setAttribute('data-confirming', 'false');
         btn.style.color = "#fff";
         marcarRecepcionEnVivo(btn, codigo);
      }
    }

    function confirmarRecepcionTodos(btnMain) {
      let botones = document.querySelectorAll('.check-btn:not(:disabled)');
      if (botones.length === 0) return;

      if (btnMain.getAttribute('data-confirming') !== 'true') {
         // Primer clic
         btnMain.setAttribute('data-confirming', 'true');
         let originalText = btnMain.innerHTML;
         btnMain.setAttribute('data-orig-text', originalText);
         
         btnMain.innerHTML = `⚠️ ¿Seguro? (Son ${botones.length} rollos)`;
         btnMain.style.backgroundColor = "#dc3545"; // Rojo advertencia masiva
         btnMain.style.color = "#fff";

         setTimeout(() => {
             if(btnMain.getAttribute('data-confirming') === 'true' && !btnMain.disabled) {
                 btnMain.setAttribute('data-confirming', 'false');
                 btnMain.innerHTML = btnMain.getAttribute('data-orig-text');
                 btnMain.style.backgroundColor = "#007bff"; // Vuelve a azul
             }
         }, 3000);
      } else {
         // Segundo clic
         btnMain.setAttribute('data-confirming', 'false');
         marcarTodosEnVivo(btnMain);
      }
    }

    // --- FUNCIONES DE PROCESAMIENTO AL SERVIDOR ---

    function marcarRecepcionEnVivo(btn, codigo) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Procesando...";
      btn.style.backgroundColor = "#fd7e14"; 

      google.script.run.withSuccessHandler(r => {
        if (r.error) {
          btn.disabled = false;
          btn.innerHTML = "❌ Error. Reintentar";
          btn.style.backgroundColor = "#dc3545"; 
          generarBeep('error');
        } else {
          btn.innerHTML = "✅ Recibido";
          btn.style.backgroundColor = "#6c757d"; 
          document.getElementById("row_" + codigo).style.backgroundColor = "#e8f5e9"; 
          document.getElementById("row_" + codigo).style.border = "1px solid #c3e6cb";
          
          window.rollosRecibidosEnVivo++;
          document.getElementById("progressCounter").innerText = window.rollosRecibidosEnVivo;
          generarBeep('success');
        }
      }).procesarRecepcionMasivaXena([codigo]); 
    }

    function marcarTodosEnVivo(btnMain) {
      let botones = document.querySelectorAll('.check-btn:not(:disabled)');
      let seleccionados = Array.from(botones).map(b => b.value);
      if (seleccionados.length === 0) return;

      btnMain.disabled = true;
      btnMain.innerHTML = "⏳ Guardando...";

      botones.forEach(btn => {
         btn.disabled = true;
         btn.innerHTML = "⏳...";
         btn.style.backgroundColor = "#fd7e14";
         btn.style.color = "#fff";
      });

      google.script.run.withSuccessHandler(r => {
        if (r.error) {
           btnMain.innerHTML = "❌ Error general";
           btnMain.style.backgroundColor = "#dc3545";
           generarBeep('error');
        } else {
           btnMain.innerHTML = "✅ Lista Completada";
           btnMain.style.backgroundColor = "#28a745";
           
           botones.forEach(btn => {
             btn.innerHTML = "✅ Recibido";
             btn.style.backgroundColor = "#6c757d";
             document.getElementById("row_" + btn.value).style.backgroundColor = "#e8f5e9";
             document.getElementById("row_" + btn.value).style.border = "1px solid #c3e6cb";
           });

           window.rollosRecibidosEnVivo += seleccionados.length;
           document.getElementById("progressCounter").innerText = window.rollosRecibidosEnVivo;
           generarBeep('success');
        }
      }).procesarRecepcionMasivaXena(seleccionados);
    }

    // ============================================
    // DASHBOARD Y DEMÁS
    // ============================================
    function cargarDashboard() {
      document.getElementById("dashBody").innerHTML = `<tr><td colspan="5" style="text-align:center;">Cargando analíticas...</td></tr>`;
      
      google.script.run.withSuccessHandler(res => {
        if (res.error) { document.getElementById("dashBody").innerHTML = `<tr><td colspan="5">${res.msg}</td></tr>`; return; }
        document.getElementById("stZ14").innerText = res.stats.enBodegaZ14;
        document.getElementById("stEnv").innerText = res.stats.enviadosHoy;
        document.getElementById("stRecHoy").innerText = res.stats.recibidosHoyXena;
        document.getElementById("stXenaTot").innerText = res.stats.totalXena;
        const ctx = document.getElementById('graficoStatus').getContext('2d');
        if (miGrafico) miGrafico.destroy();
        miGrafico = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Z14', 'Tránsito', 'Xena'], datasets: [{ data: [res.stats.enBodegaZ14, res.stats.enviadosHoy, res.stats.totalXena], backgroundColor: ['#007bff', '#fd7e14', '#28a745'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
        });
        let h = "";
        res.data.forEach(r => {
          let css = r.estado.includes("BODEGA") ? "b-bodega" : (r.estado.includes("TRÁNSITO") ? "b-transito" : "b-xena");
          let shortEst = r.estado.replace("RECIBIDO XENA COJ", "RECIBIDO XENA");
          h += `<tr data-estado="${shortEst}"><td>${r.id}</td><td>${r.codigo}</td><td>${r.metros}</td><td>${r.yardas}</td><td><span class="badge ${css}">${shortEst}</span></td></tr>`;
        });
        document.getElementById("dashBody").innerHTML = h;
      }).obtenerDatosDashboard();
    }

    function filtrarTabla() {
      let txt = document.getElementById("buscadordash").value.toUpperCase();
      let est = document.getElementById("filtroEstado").value;
      let trs = document.getElementById("tablaDash").getElementsByTagName("tr");
      for (let i = 1; i < trs.length; i++) {
        let pTxt = trs[i].textContent.toUpperCase().indexOf(txt) > -1;
        let pEst = est === "" || trs[i].getAttribute("data-estado") === est;
        trs[i].style.display = (pTxt && pEst) ? "" : "none";
      }
    }

    function solicitarManifiesto() {
      Swal.fire({ title: 'Armando Manifiesto...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      google.script.run.withSuccessHandler(res => {
        if (res.error) { generarBeep('error'); Swal.fire('Info', res.msg, 'info'); } 
        else { generarBeep('success'); Swal.close(); document.getElementById('printArea').innerHTML = res.html; window.print(); }
      }).obtenerManifiestoHTML();
    }

    document.getElementById("manualCode").addEventListener("keypress", function(e) { if (e.key === "Enter") { e.preventDefault(); enviarCodigoManual(); }});
    function abrirCamaraNativa() { document.getElementById('camaraNativa').click(); }
    
    document.getElementById('camaraNativa').addEventListener('change', function(e) {
      if (e.target.files.length === 0) return;
      Swal.fire({ title: 'Analizando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      html5QrCode.scanFile(e.target.files[0], false).then(txt => { procesarCodigo(String(txt)); })
      .catch(err => { generarBeep('error'); Swal.fire('Error', 'Código no legible', 'warning'); document.getElementById('camaraNativa').value = ""; });
    });

    function enviarCodigoManual() {
      const codigo = document.getElementById("manualCode").value.replace(/[\r\n\t\s]+/g, ""); 
      if(!codigo) return Swal.fire("Atención", "Ingresa un código.", "warning");
      if (isProcessing) return; procesarCodigo(codigo);
    }

    function procesarCodigo(codigo) {
      isProcessing = true;
      const fase = document.getElementById("faseSelector").value;
      Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      google.script.run.withSuccessHandler(res => {
        document.getElementById("manualCode").value = ""; document.getElementById('camaraNativa').value = ""; isProcessing = false;
        
        if (res.status === "success") {
          generarBeep('success');
          let htmlAlert = `<div style="background:#e8f5e9; padding:10px; border-radius:8px; font-weight:bold; color:#2e7d32; font-size:18px; margin-bottom: 10px;">${res.msg}</div>`;
          
          if (fase === "ingreso") {
             htmlAlert += `<div style="background:#e3f2fd; color:#0d47a1; padding:12px; border-radius:8px; margin-bottom:12px; font-size:14px; text-align:center;">📦 <b>Contenedor Global:</b><br> ${res.detalles.globalIngresados} de ${res.detalles.globalTotal} rollos<br><hr style="border-top:1px solid #b6d4fe; margin:8px 0;">🏷️ <b>Artículo ${res.detalles.codigoDist}:</b><br> ${res.detalles.ingresadosArticulo} de ${res.detalles.totalArticulo} rollos</div>`;
             if(res.detalles.ingresadosArticulo === res.detalles.totalArticulo) htmlAlert += `<div style="background:#d4edda; color:#155724; padding:8px; border-radius:6px; margin-bottom:12px; font-size:13px; text-align:center;">✅ ¡Lote de este artículo completado!</div>`;
          } 
          else if (fase === "piloto") htmlAlert += `<div style="background:#fff3cd; color:#856404; padding:10px; border-radius:8px; margin-bottom:12px; font-size:14px;">🚚 <b>Rendimiento Diario:</b> Has cargado <b>${res.detalles.cargadosHoy} rollos</b> al camión hoy.</div>`;
          else if (fase === "xena") htmlAlert += `<div style="background:#e8f5e9; color:#2e7d32; padding:10px; border-radius:8px; margin-bottom:12px; font-size:14px; text-align:left;">📈 <b>Recepción Xena Coj:</b><br>• Descargados Hoy: <b>${res.detalles.recibidosHoy} rollos</b>.<br>• Inventario Total: <b>${res.detalles.totalRecibidos} rollos</b>.</div>`;

          htmlAlert += `<table class="tabla-info"><tr><td class="titulo">ID Único:</td><td class="valor">${res.detalles.codigo}</td></tr><tr><td class="titulo">Pieza:</td><td class="valor">${res.detalles.pieza}</td></tr><tr><td class="titulo">Cód. Dist:</td><td class="valor">${res.detalles.codigoDist}</td></tr><tr><td class="titulo">Medida:</td><td class="valor">${res.detalles.metros} Mts / ${res.detalles.yardas} Yds</td></tr></table>`;

          Swal.fire({ icon: 'success', title: '', html: htmlAlert, allowOutsideClick: false, confirmButtonText: 'SIGUIENTE 👍' }).then(() => document.getElementById("manualCode").focus());
        } else {
          generarBeep('error');
          Swal.fire({ icon: res.status, title: 'Validación', html: `<b>${res.msg}</b>`, confirmButtonText: 'ENTENDIDO' }).then(() => document.getElementById("manualCode").focus());
        }
      }).withFailureHandler(err => { isProcessing = false; generarBeep('error'); Swal.fire('Error', err.message, 'error'); }).ejecutarFlujoZ14(codigo, fase); 
    }
  </script>
</body>
</html>