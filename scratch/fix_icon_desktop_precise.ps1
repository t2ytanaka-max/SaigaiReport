Add-Type -AssemblyName System.Drawing

$src = 'C:\Users\tanak\OneDrive\AI\SaigaiReport\public\pwa-512x512.png'
$desktop = [Environment]::GetFolderPath('Desktop')
$dst = Join-Path $desktop 'disaster_app_icon_new.png'

# Load image
$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)

# 1. Fill background (Orange)
$color = [System.Drawing.Color]::FromArgb(255, 239, 131, 21)
$g.Clear($color)

# 2. Draw original design
$g.DrawImage($img, 0, 0)

# 3. Setup font (Small enough to fit in the circle)
# Font size reduced from 0.11 to 0.08
$fontSize = $img.Width * 0.08
$font = New-Object System.Drawing.Font('Arial', $fontSize, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::White

# Unicode: 大=0x5927, 村=0x6751
$t1 = [char]0x5927
$t2 = [char]0x6751

# 4. Accurate Positioning (Inside the circle)
$centerX = $img.Width / 2
$centerY = $img.Height * 0.42 # Center of the circle

$size1 = $g.MeasureString($t1, $font)
$size2 = $g.MeasureString($t2, $font)

# Tighten the vertical space between characters
$g.DrawString($t1, $font, $brush, ($centerX - $size1.Width / 2), ($centerY - $size1.Height * 0.85))
$g.DrawString($t2, $font, $brush, ($centerX - $size2.Width / 2), ($centerY + $size2.Height * 0.05))

# 5. Save and Cleanup
$bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$img.Dispose()

Write-Host "Re-generated! Check your desktop for updated: disaster_app_icon_new.png"
