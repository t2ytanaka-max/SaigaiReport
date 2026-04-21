Add-Type -AssemblyName System.Drawing

$src = 'C:\Users\tanak\OneDrive\AI\SaigaiReport\public\pwa-512x512.png'
$dst = 'C:\Users\tanak\.gemini\antigravity\brain\af8e617d-5f62-466e-8572-e88fc31f6c30\icon_fix_final.png'

$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)

# オレンジ色 (239, 131, 21) で背景をクリア
$color = [System.Drawing.Color]::FromArgb(255, 239, 131, 21)
$g.Clear($color)

# 元画像を1pxも変えずに描画
$g.DrawImage($img, 0, 0)

# フォント設定 (Arial/MS Gothic)
$fontSize = $img.Width * 0.11
$font = New-Object System.Drawing.Font('Arial', $fontSize, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::White

# 大村 (Unicode: 大=0x5927, 村=0x6751)
$t1 = [char]0x5927
$t2 = [char]0x6751

$size1 = $g.MeasureString($t1, $font)
$size2 = $g.MeasureString($t2, $font)

$x = $img.Width / 2
$y = $img.Height * 0.43

# 位置合わせをして描画
$g.DrawString($t1, $font, $brush, ($x - $size1.Width / 2), ($y - $size1.Height * 0.95))
$g.DrawString($t2, $font, $brush, ($x - $size2.Width / 2), ($y + $size2.Height * 0.05))

# PNGとして保存
$bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$img.Dispose()
