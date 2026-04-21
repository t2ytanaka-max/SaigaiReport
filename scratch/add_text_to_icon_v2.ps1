Add-Type -AssemblyName System.Drawing

$InputPath = 'C:\Users\tanak\OneDrive\AI\SaigaiReport\public\pwa-512x512.png'
$OutputPath = 'C:\Users\tanak\.gemini\antigravity\brain\af8e617d-5f62-466e-8572-e88fc31f6c30\icon_omura_final_preview.png'

$img = [System.Drawing.Image]::FromFile($InputPath)
$bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)

# 背景をオリジナルに合わせたオレンジ色で塗りつぶす (A4 59 15)
$orangeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 239, 131, 15))
$g.FillRectangle($orangeBrush, 0, 0, $img.Width, $img.Height)

# 元画像を重ねる
$g.DrawImage($img, 0, 0, $img.Width, $img.Height)

# 文字設定（大村）
$fontSize = $img.Width * 0.12
$font = New-Object System.Drawing.Font("MS Gothic", $fontSize, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::White

# Unicodeで「大」「村」を直接指定して文字化け回避
$t1 = [char]0x5927 # 大
$t2 = [char]0x6751 # 村

$centerX = $img.Width / 2
$centerY = $img.Height * 0.43

$size1 = $g.MeasureString($t1, $font)
$size2 = $g.MeasureString($t2, $font)

# 描画
$g.DrawString($t1, $font, $brush, ($centerX - $size1.Width / 2), ($centerY - $size1.Height))
$g.DrawString($t2, $font, $brush, ($centerX - $size2.Width / 2), ($centerY))

# 保存
$bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$img.Dispose()
