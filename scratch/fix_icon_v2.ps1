Add-Type -AssemblyName System.Drawing
$sourcePath = "C:\Users\tanak\.gemini\antigravity\brain\af8e617d-5f62-466e-8572-e88fc31f6c30\media__1776264218202.jpg"
$destPath = "C:\Users\tanak\.gemini\antigravity\brain\af8e617d-5f62-466e-8572-e88fc31f6c30\final_perfect_origin.png"

try {
    $img = [System.Drawing.Image]::FromFile($sourcePath)
    $bmp = New-Object System.Drawing.Bitmap(512, 512)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    # 高画質な補完設定
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    $srcBmp = New-Object System.Drawing.Bitmap($img)
    # 中央上部のオレンジ色を正確に抽出
    $orange = $srcBmp.GetPixel([int]($srcBmp.Width / 2), [int]($srcBmp.Height / 10))
    $g.Clear($orange)

    # 1.1倍に拡大して描画（これにより四隅のクリーム色の背景を枠の外へ押し出す）
    # 512 * 1.1 = 564
    # 差分の半分 (564 - 512) / 2 = 26 ピクセル分だけ左上にずらして配置
    $zoom = 1.12
    $newSize = [int](512 * $zoom)
    $offset = [int](($newSize - 512) / 2)
    $g.DrawImage($img, -$offset, -$offset, $newSize, $newSize)

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    if ($null -ne $img) { $img.Dispose() }
    if ($null -ne $bmp) { $bmp.Dispose() }
    if ($null -ne $srcBmp) { $srcBmp.Dispose() }
    if ($null -ne $g) { $g.Dispose() }
}
