# -*- coding: utf-8 -*-
Add-Type -AssemblyName System.Drawing

function Add-TextToIcon {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [string]$Text1,
        [string]$Text2
    )

    $img = [System.Drawing.Image]::FromFile($InputPath)
    $bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)

    # background color
    $orangeBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 239, 131, 21))
    $g.FillRectangle($orangeBrush, 0, 0, $bmp.Width, $bmp.Height)

    # original image
    $g.DrawImage($img, 0, 0, $img.Width, $img.Height)

    # font settings
    $fontSize = $img.Width * 0.12
    # Try different font families if MS Gothic is not found
    $fontFamily = "MS Gothic"
    $font = New-Object System.Drawing.Font($fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold)
    $brush = [System.Drawing.Brushes]::White

    # text positions
    $centerX = $img.Width / 2
    $centerY = $img.Height * 0.42

    $size1 = $g.MeasureString($Text1, $font)
    $size2 = $g.MeasureString($Text2, $font)

    $g.DrawString($Text1, $font, $brush, ($centerX - $size1.Width / 2), ($centerY - $size1.Height))
    $g.DrawString($Text2, $font, $brush, ($centerX - $size2.Width / 2), ($centerY))

    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bmp.Dispose()
    $img.Dispose()
}

$source = "C:\Users\tanak\OneDrive\AI\SaigaiReport\public\pwa-512x512.png"
$output = "C:\Users\tanak\.gemini\antigravity\brain\af8e617d-5f62-466e-8572-e88fc31f6c30\icon_omura_final_preview.png"

Add-TextToIcon -InputPath $source -OutputPath $output -Text1 "大" -Text2 "村"
