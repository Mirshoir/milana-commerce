# Self-hosts Google Fonts (latin subset) and JS libraries.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$fontDir = Join-Path $root "assets\fonts"
$vendDir = Join-Path $root "js\vendor"
New-Item -ItemType Directory -Force -Path $fontDir, $vendDir | Out-Null

# --- fonts ---
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
$cssUrl = "https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;0,6..96,600;1,6..96,400;1,6..96,500&family=Jost:wght@300;400;500;600&display=swap"
$css = (Invoke-WebRequest -Uri $cssUrl -Headers @{ "User-Agent" = $ua } -TimeoutSec 60).Content

# keep only latin-subset @font-face blocks
$blocks = [regex]::Matches($css, "/\*\s*([a-z-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})")
$out = New-Object System.Text.StringBuilder
$seen = @{}
foreach ($m in $blocks) {
  if ($m.Groups[1].Value -ne "latin") { continue }
  $block = $m.Groups[2].Value
  $urlMatch = [regex]::Match($block, "url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)")
  if (-not $urlMatch.Success) { continue }
  $url = $urlMatch.Groups[1].Value
  $file = Split-Path $url -Leaf
  if (-not $seen[$file]) {
    Invoke-WebRequest -Uri $url -OutFile (Join-Path $fontDir $file) -TimeoutSec 60 | Out-Null
    $seen[$file] = $true
  }
  $block = $block.Replace($url, "../assets/fonts/$file")
  [void]$out.AppendLine($block)
  [void]$out.AppendLine()
}
Set-Content -Path (Join-Path $root "css\fonts.css") -Value $out.ToString() -Encoding utf8
Write-Output ("fonts: {0} files, fonts.css written" -f $seen.Count)

# --- js libs ---
$libs = @{
  "gsap.min.js"          = "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"
  "ScrollTrigger.min.js" = "https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js"
  "lenis.min.js"         = "https://cdn.jsdelivr.net/npm/lenis@1.3.11/dist/lenis.min.js"
}
foreach ($name in $libs.Keys) {
  Invoke-WebRequest -Uri $libs[$name] -OutFile (Join-Path $vendDir $name) -TimeoutSec 60 | Out-Null
  $kb = [Math]::Round((Get-Item (Join-Path $vendDir $name)).Length / 1KB)
  Write-Output ("vendor: {0} ({1} KB)" -f $name, $kb)
}
Write-Output "DONE"
