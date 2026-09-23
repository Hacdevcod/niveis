$ErrorActionPreference = 'Stop'

$android = $PSScriptRoot
$jdk     = 'C:\Users\ADM\gps-jdk17\jdk-17.0.20.1+1'
$env:JAVA_HOME = $jdk
$env:Path = "$jdk\bin;" + $env:Path
$sdk     = 'C:\Users\ADM\gps-sdk'
$bt      = Join-Path $sdk 'build-tools\35.0.0'
$platform = Join-Path $sdk 'platforms\android-35'
$androidJar = Join-Path $platform 'android.jar'

$aapt      = Join-Path $bt 'aapt.exe'
$d8        = Join-Path $bt 'd8.bat'
$zipalign  = Join-Path $bt 'zipalign.exe'
$apksigner = Join-Path $bt 'apksigner.bat'
$javac     = Join-Path $jdk 'bin\javac.exe'
$keytool   = Join-Path $jdk 'bin\keytool.exe'

$www      = Join-Path $android 'assets\www'
$src      = Join-Path $android 'src'
$obj      = Join-Path $android 'obj'
$dex      = Join-Path $android 'dexout'
$res      = Join-Path $android 'res'
$manifest = Join-Path $android 'AndroidManifest.xml'

$ks       = Join-Path $android 'afline-niveis.keystore'
$pass     = 'afline2026'
$aaptOut  = Join-Path $android 'app.unsigned.apk'
$repacked = Join-Path $android 'app.unsigned.dfl.apk'
$aligned  = Join-Path $android 'app.aligned.apk'
$final    = Join-Path $android 'Afline-Niveis.apk'

if (-not (Test-Path $www)) { throw "assets/www nao encontrado em $www" }

# ---- URL do Worker Cloudflare ==
$urlFile = Join-Path $android 'worker_url.txt'
if (-not (Test-Path $urlFile)) { throw "worker_url.txt nao encontrado. Coloque a URL publica do Worker (ex.: https://afline-niveis.<seu>.workers.dev) nesse arquivo." }
$baseUrl = (Get-Content $urlFile -Raw).Trim().TrimEnd('/')
if ($baseUrl.Length -lt 15 -or $baseUrl -match 'YOUR_SUBDOMAIN|altere') { throw "worker_url.txt parece invalido (precisa da URL real do Worker deployado)." }

# ---- Versao ----
Write-Host '== 0/8 versao automatica do build =='
$verFile = Join-Path $android 'version.txt'
$buildN = 0
if (Test-Path $verFile) { $buildN = [int]((Get-Content $verFile -Raw).Trim()) }
$buildN++
$vNome = "1.$buildN"
$vData = Get-Date -Format 'dd/MM/yyyy HH:mm'
$vTxt  = "v$vNome (build $buildN - $vData)"
Set-Content -Path $verFile -Value ([string]$buildN) -Encoding Ascii
Write-Host "  versao: $vTxt - worker: $baseUrl"

# ---- Injeta CONFIG no web app ----
Write-Host '== 1/8 config.js =='
$configJs = @"
// Configuração gerada automaticamente pelo build.ps1 — não editar manualmente.
var CONFIG = {
  APP_VERSION: "$vNome",
  APP_NAME: "Afline Niveis",
  API_BASE_URL: "$baseUrl"
};
"@
[System.IO.File]::WriteAllText((Join-Path $www 'js\config.js'), $configJs, (New-Object System.Text.UTF8Encoding($false)))

# ---- Atualiza manifest (versionCode/Name) ----
$manifestText = Get-Content $manifest -Raw -Encoding UTF8
$manifestText = [regex]::Replace($manifestText, 'android:versionCode="\d+"', ('android:versionCode="' + $buildN + '"'))
$manifestText = [regex]::Replace($manifestText, 'android:versionName="[^"]*"', ('android:versionName="' + $vNome + '"'))
[System.IO.File]::WriteAllText($manifest, $manifestText, (New-Object System.Text.UTF8Encoding($false)))

Write-Host '== 2/8 limpando artefatos anteriores =='
New-Item -ItemType Directory -Force -Path $obj, $dex | Out-Null
foreach ($d in @($obj, $dex)) { if (Test-Path $d) { Get-ChildItem $d -Recurse -File | Remove-Item -Force } }
foreach ($f in @($aaptOut, $repacked, $aligned, $final)) { if (Test-Path $f) { Remove-Item $f -Force } }

Write-Host '== 3/8 aapt package (manifest + res + assets) =='
& $aapt package -f -M $manifest -S $res -A $www -I $androidJar -F $aaptOut 2>&1 | Write-Host
if (-not (Test-Path $aaptOut)) { throw 'aapt package falhou' }

Write-Host '== 4/8 javac =='
$files = @(Get-ChildItem $src -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $javac -d $obj -bootclasspath $androidJar -source 8 -target 8 -encoding UTF-8 -nowarn $files 2>&1 | ForEach-Object { Write-Host "  $_" }
$ErrorActionPreference = $prevEAP
$classCount = @(Get-ChildItem $obj -Recurse -Filter *.class).Count
if ($classCount -eq 0) { throw 'javac nao gerou classes' }
Write-Host "  classes: $classCount"

Write-Host '== 5/8 d8 =='
$classArgs = @(Get-ChildItem $obj -Recurse -Filter *.class | ForEach-Object { $_.FullName })
& cmd /c call "$d8" --release --lib $androidJar --min-api 24 --output $dex $classArgs 2>&1 | Write-Host
if (-not (Test-Path (Join-Path $dex 'classes.dex'))) { throw 'd8 nao gerou classes.dex' }

Write-Host '== 6/8 adicionando classes.dex =='
Push-Location $dex
try {
  & $aapt add $aaptOut 'classes.dex' 2>&1 | Write-Host
} finally {
  Pop-Location
}

Write-Host '== 6b/8 repack forcando DEFLATE =='
& python.exe (Join-Path $PSScriptRoot 'repack.py') $aaptOut $repacked
if (-not (Test-Path $repacked)) { throw 'repack falhou' }

Write-Host '== 7/8 zipalign =='
& $zipalign -f 4 $repacked $aligned 2>&1 | Write-Host
if (-not (Test-Path $aligned)) { throw 'zipalign falhou' }

Write-Host '== 8/8 assinatura =='
if (-not (Test-Path $ks)) {
  & $keytool -genkeypair -keystore $ks -alias afline -keyalg RSA -keysize 2048 -validity 10000 -storepass $pass -keypass $pass -dname 'CN=Afline Niveis, O=Grupo Afline, C=BR'
}
& cmd /c call "$apksigner" sign --ks $ks --ks-pass pass:$pass --key-pass pass:$pass --out $final $aligned 2>&1 | Write-Host
if (-not (Test-Path $final)) { throw 'apksigner falhou' }

Write-Host ''
Write-Host ("APK gerado: " + $final + "  (" + [int](Get-Item $final).Length + " bytes)")

$verOut = Join-Path $android ("Afline-Niveis-" + $vNome + '.apk')
Copy-Item $final $verOut -Force
Write-Host ("Copia versionada: " + $verOut + "  (" + [int](Get-Item $verOut).Length + " bytes)")