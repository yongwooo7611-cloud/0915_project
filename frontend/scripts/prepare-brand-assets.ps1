param([Parameter(Mandatory=$true)][string]$IconSource, [Parameter(Mandatory=$true)][string]$OgSource)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '../public/branding'
function Export-ResizedImage([string]$Source, [string]$Name, [int]$Width, [int]$Height, [bool]$Jpeg = $false) {
  $sourceImage = [System.Drawing.Image]::FromFile($Source)
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($sourceImage, 0, 0, $Width, $Height)
    $format = if ($Jpeg) { [System.Drawing.Imaging.ImageFormat]::Jpeg } else { [System.Drawing.Imaging.ImageFormat]::Png }
    $bitmap.Save((Join-Path $destination $Name), $format)
  } finally { $graphics.Dispose(); $bitmap.Dispose(); $sourceImage.Dispose() }
}
Export-ResizedImage $IconSource 'favicon-32.png' 32 32
Export-ResizedImage $IconSource 'favicon-192.png' 192 192
Export-ResizedImage $IconSource 'apple-touch-icon.png' 180 180
Export-ResizedImage $OgSource 'moa-og-v1.jpg' 1200 630 $true
Get-ChildItem $destination | Select-Object Name, Length
