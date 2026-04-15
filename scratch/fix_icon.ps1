Add-Type -AssemblyName System.Drawing
$sourcePath = "C:\Users\tanak\.gemini\antigravity\brain\af8e617d-5f62-466e-8572-e88fc31f6c30\media__1776264218202.jpg"
$destPath = "C:\Users\tanak\.gemini\antigravity\brain\af8e617d-5f62-466e-8572-e88fc31f6c30\mechanical_fix_icon.png"

try {
    $img = [System.Drawing.Image]::FromFile($sourcePath)
    $bmp = New-Object System.Drawing.Bitmap(512, 512)
    $g = [System.Drawing.Graphics]::FromImage($bmp)

    $srcBmp = New-Object System.Drawing.Bitmap($img)
    # オレンジ色を画像の中央上部付近から抽出（ロゴを避けるため中心より上）
    $orange = $srcBmp.GetPixel([int]($srcBmp.Width / 2), [int]($srcBmp.Height / 10))

    # 全面を抽出したオレンジ色で塗りつぶし
    $g.Clear($orange)

    # オリジナル画像を512x512に引き伸ばして描画
    $g.DrawImage($img, 0, 0, 512, 512)

    # 四隅のクリーム色（背景）を判定してオレンジ色に置換
    # クリーム色は明るさが高い（R,G,Bが230以上目安）部分を対象とする
    for ($x = 0; $x -lt 512; $x++) {
        for ($y = 0; $y -lt 512; $y++) {
            $c = $bmp.GetPixel($x, $y)
            if ($c.R -gt 230 -and $c.G -gt 230 -and $c.B -gt 210) {
                $bmp.SetPixel($x, $y, $orange)
            }
        }
    }

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Success: Icon saved to $destPath"
}
finally {
    if ($null -ne $img) { $img.Dispose() }
    if ($null -ne $bmp) { $bmp.Dispose() }
    if ($null -ne $srcBmp) { $srcBmp.Dispose() }
    if ($null -ne $g) { $g.Dispose() }
}
