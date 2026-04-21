Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\tanak\OneDrive\AI\SaigaiReport\public\pwa-512x512.png'
$dstPath = 'C:\Users\tanak\.gemini\antigravity\brain\af8e617d-5f62-466e-8572-e88fc31f6c30\icon_omura_final_preview.png'

if (!(Test-Path $srcPath)) {
    Write-Error "Source file not found: $srcPath"
    exit
}

$img = [System.Drawing.Image]::FromFile($srcPath)
$bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)

# 1. 四隅をオレンジで塗りつぶす (オリジナルに合わせた色)
$orangeColor = [System.Drawing.Color]::FromArgb(255, 239, 131, 21)
$orangeBrush = New-Object System.Drawing.SolidBrush($orangeColor)
$g.FillRectangle($orangeBrush, 0, 0, $img.Width, $img.Height)

# 2. 元のハッピのデザインを描画
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)

# 3. 「大村」の文字を書き込む (Unicodeエスケープで文字化け回避)
# [char]0x5927 = 大, [char]0x6751 = 村
$t1 = [char]0x5927
$t2 = [char]0x6751

$fontSize = $img.Width * 0.12
$font = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::White

# 中心の青い円に位置合わせ
$centerX = $img.Width / 2
$centerY = $img.Height * 0.43

$size1 = $g.MeasureString($t1, $font)
$size2 = $g.MeasureString($t2, $font)

$g.DrawString($t1, $font, $brush, ($centerX - $size1.Width / 2), ($centerY - $size1.Height))
$g.DrawString($t2, $font, $brush, ($centerX - $size2.Width / 2), ($centerY))

# 4. 保存
$bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$img.Dispose()
Write-Host "Success: $dstPath"
