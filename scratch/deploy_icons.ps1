Add-Type -AssemblyName System.Drawing

$newIconSource = Join-Path ([Environment]::GetFolderPath('Desktop')) 'disaster_app_icon_new.png'
$publicDir = 'c:\Users\tanak\OneDrive\AI\SaigaiReport\public'

function Resize-And-Save {
    param($src, $dstPath, $size)
    $img = [System.Drawing.Image]::FromFile($src)
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $size, $size)
    $bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()
    Write-Host "Replaced: $dstPath ($($size)x$($size))"
}

# 192x192
Resize-And-Save -src $newIconSource -dstPath (Join-Path $publicDir 'pwa-192x192.png') -size 192
# 512x512
Resize-And-Save -src $newIconSource -dstPath (Join-Path $publicDir 'pwa-512x512.png') -size 512
# Apple Touch Icon (Same size as pwa-192x192)
Copy-Item (Join-Path $publicDir 'pwa-192x192.png') (Join-Path $publicDir 'apple-touch-icon.png') -Force

Write-Host "Icons replacement complete."
