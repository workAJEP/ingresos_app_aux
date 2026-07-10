# poll-agent.ps1 — Poller de impresión (Camino A del runbook).
#
# Corre en la PC junto a la impresora TTP-345. Cada INTERVAL segundos sondea la
# web, baja los trabajos encolados (GET /api/print/jobs con x-pull-token),
# escribe un CSV por trabajo en OUT_DIR y lo manda a BarTender.
#
# Requisitos: PowerShell 5.1. No necesita admin ni tocar el registro: fuerza
# TLS 1.2 a nivel de proceso. La configuración llega por variables de entorno
# desde poll-agent.bat.

$ErrorActionPreference = 'Stop'

# TLS 1.2 obligatorio para hablar con Vercel/Upstash sin tocar el sistema.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# --- Configuración (viene de poll-agent.bat) ---------------------------
$ApiUrl     = $env:API_URL
$PullToken  = $env:PULL_TOKEN
$OutDir     = if ($env:OUT_DIR) { $env:OUT_DIR } else { 'C:\BarTenderIn' }
$BtwPath    = $env:BTW_PATH
$BartendExe = $env:BARTEND_EXE
$Printer    = $env:PRINTER
$Interval   = if ($env:INTERVAL) { [int]$env:INTERVAL } else { 3 }

if (-not $ApiUrl)    { Write-Error 'Falta API_URL en poll-agent.bat'; exit 1 }
if (-not $PullToken) { Write-Error 'Falta PULL_TOKEN en poll-agent.bat'; exit 1 }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$JobsUrl = "$($ApiUrl.TrimEnd('/'))/api/print/jobs"
$Headers = @{ 'x-pull-token' = $PullToken }
$Cols    = @('token', 'bulto', 'marchamo', 'envio', 'destino', 'origen')

Write-Host "[poller] sondeo cada $Interval s -> $JobsUrl"
Write-Host "[poller] salida CSV: $OutDir"
if ($BtwPath) { Write-Host "[poller] BarTender: $BartendExe  /F=$BtwPath  /PRN=$Printer" }
else { Write-Host '[poller] sin BTW_PATH: solo se deja el CSV (usar Integration Builder).' }

# Escapa una celda CSV (comillas dobles si trae coma/comilla/salto).
function Format-Cell($v) {
  if ($null -eq $v) { return '' }
  $s = [string]$v
  if ($s -match '[",\r\n]') { return '"' + $s.Replace('"', '""') + '"' }
  return $s
}

# Escribe el CSV de forma atómica (.tmp + rename) para que BarTender nunca lea
# un archivo a medias.
function Write-CsvFile($rows, $path) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine(($Cols -join ','))
  foreach ($r in $rows) {
    $line = ($Cols | ForEach-Object { Format-Cell $r.$_ }) -join ','
    [void]$sb.AppendLine($line)
  }
  $tmp = "$path.tmp"
  # UTF-8 sin BOM para que los acentos salgan bien en la etiqueta.
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($tmp, $sb.ToString(), $enc)
  Move-Item -LiteralPath $tmp -Destination $path -Force
}

$seq = 0
while ($true) {
  try {
    $resp = Invoke-RestMethod -Uri $JobsUrl -Headers $Headers -Method Get -TimeoutSec 20
    $jobs = @($resp.jobs)
    foreach ($job in $jobs) {
      $rows = @($job.rows)
      if ($rows.Count -eq 0) { continue }
      $seq++
      $stamp = (Get-Date -Format 'yyyyMMdd_HHmmss')
      $csv = Join-Path $OutDir ("stickers_{0}_{1}.csv" -f $stamp, $seq)
      Write-CsvFile $rows $csv
      Write-Host "[poller] $($rows.Count) fila(s) -> $csv"

      if ($BtwPath -and $BartendExe) {
        $args = @("/F=$BtwPath", "/D=$csv", '/P', '/X')
        if ($Printer) { $args += "/PRN=$Printer" }
        & $BartendExe @args
        Write-Host "[poller] impreso ($($rows.Count) etiquetas)"
      }
    }
  } catch {
    Write-Warning "[poller] $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $Interval
}
