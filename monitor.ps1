# Monitor de status do Afline Niveis (terminal em 2o plano).
# Roda em loop; feche a janela quando quiser - o watchdog continua.
$t = Join-Path $env:TEMP 'opencode\tun'
$live = 'C:\Users\ADM\Documents\Default Project\niveis-dash\cloudflare\public\live-url.txt'
while ($true) {
  cls
  Write-Host ('== Afline Niveis - ' + (Get-Date -Format 'HH:mm:ss') + ' ==') -ForegroundColor Cyan
  $p = (Test-NetConnection 127.0.0.1 -Port 8777 -WarningAction SilentlyContinue).TcpTestSucceeded
  Write-Host ('Proxy 8777: ' + $(if ($p) { 'UP' } else { 'DOWN' }))
  $c = (tasklist /FI 'IMAGENAME eq cloudflared.exe' | Select-String 'cloudflared').Count
  Write-Host ('Tunel     : ' + $(if ($c -gt 0) { 'UP' } else { 'DOWN' }))
  if ($p -and $c -gt 0) { Write-Host 'Sistema    : ONLINE' -ForegroundColor Green }
  else { Write-Host 'Sistema    : OFFLINE' -ForegroundColor Red }
  if (Test-Path $live) {
    $u = Get-Content $live | Where-Object { $_ -match 'trycloudflare' } | Select-Object -First 1
    if ($u) { Write-Host ('Tunel URL  : ' + $u) -ForegroundColor Yellow }
  }
  Write-Host 'Link fixo  : https://afline-niveis.codw23.workers.dev/' -ForegroundColor Green
  Write-Host '--- watchdog.log (ultimas linhas) ---'
  if (Test-Path (Join-Path $t 'watchdog.log')) { Get-Content (Join-Path $t 'watchdog.log') -Tail 4 }
  Start-Sleep -Seconds 10
}