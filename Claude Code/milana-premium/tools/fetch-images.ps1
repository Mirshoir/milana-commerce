# Downloads generated campaign images and re-encodes them as web-optimized JPEGs.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$base = "https://d8j0ntlcm91z4.cloudfront.net/user_34eZBNjNLgypc1pRns2x3gmtdUD"
$map = [ordered]@{
  "hero"         = "hf_20260611_103743_0bcf8c2f-0051-4269-8b24-a3918720538c.png"
  "look-ivory"   = "hf_20260611_103746_798136a2-4cc7-4f85-a9a1-1d546c024248.png"
  "look-men"     = "hf_20260611_103749_29974aa8-1a2a-4914-a4be-c0ae14251f13.png"
  "look-knit"    = "hf_20260611_103755_62e798bf-3118-4d74-9edf-9e1611987239.png"
  "cat-women"    = "hf_20260611_103757_fca739dd-8389-495a-bc81-51356c424199.png"
  "cat-men"      = "hf_20260611_103800_c6d532f1-8673-43e6-a279-d5f910006b92.png"
  "cat-kids"     = "hf_20260611_103815_d277858e-d34b-46c6-8131-8ae0a911da92.png"
  "cat-pajamas"  = "hf_20260611_103818_501242f8-f1e9-4fbc-8b39-a29eeac1073e.png"
  "cat-robes"    = "hf_20260611_103822_0c9d0ed6-61a3-4b00-b065-0f32305be8fd.png"
  "cat-home"     = "hf_20260611_103825_ad859ebe-8c1b-4c62-953c-1d73adbabe9e.png"
  "prod-1"       = "hf_20260611_103829_5cf68d3b-9b1c-4432-bf65-167c4b54a2e0.png"
  "prod-2"       = "hf_20260611_103833_15224a2e-46c3-4a16-8645-87827e13012b.png"
  "prod-3"       = "hf_20260611_103847_6eb0ceab-fa0e-4233-b5e2-63c1c45f8163.png"
  "prod-4"       = "hf_20260611_103850_b5f66e68-ea65-4a1f-b772-3fc8f0bc9d28.png"
  "lb-couple"    = "hf_20260611_103853_6f46eb13-c474-499c-97bb-15ff7c9078f3.png"
  "lb-still"     = "hf_20260611_103856_d9bc8f29-976f-4cda-a893-dac3b13300cb.png"
  "atelier"      = "hf_20260611_103900_3c996811-6f69-483d-8729-d457fccf1954.png"
  "fabric"       = "hf_20260611_103903_d84925e5-5aae-4906-a45b-e6b3aac5a5ca.png"
  "detail-stack" = "hf_20260611_103907_ed2d8f07-7572-4a77-a6a8-9d37e92626f5.png"
  "detail-pack"  = "hf_20260611_103910_3293dd48-29c7-44c0-8d6c-dab58ff25b3b.png"
}

$imgDir = Join-Path $PSScriptRoot "..\assets\img" | Resolve-Path
$tmpDir = Join-Path $imgDir "_src"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]78)

$maxEdge = 1600
foreach ($name in $map.Keys) {
  $png = Join-Path $tmpDir "$name.png"
  $jpg = Join-Path $imgDir "$name.jpg"
  Invoke-WebRequest -Uri "$base/$($map[$name])" -OutFile $png -TimeoutSec 90 | Out-Null

  $src = [System.Drawing.Image]::FromFile($png)
  try {
    $scale = [Math]::Min(1.0, $maxEdge / [Math]::Max($src.Width, $src.Height))
    $w = [int]([Math]::Round($src.Width * $scale))
    $h = [int]([Math]::Round($src.Height * $scale))
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $w, $h)
    $g.Dispose()
    $bmp.Save($jpg, $jpegCodec, $encParams)
    $bmp.Dispose()
  } finally { $src.Dispose() }

  $kb = [Math]::Round((Get-Item $jpg).Length / 1KB)
  Write-Output ("{0,-14} {1}x{2}  {3} KB" -f "$name.jpg", $w, $h, $kb)
}

Remove-Item -Recurse -Force $tmpDir
Write-Output "DONE: $($map.Count) images in $imgDir"
