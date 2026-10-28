# IconBuildingCottage geometry from @tabler/icons-react (MIT).
# Matches web/App.tsx: stroke 1.5, brand color #153e33.
Add-Type -AssemblyName System.Drawing
$iconRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$bitmap = [Drawing.Bitmap]::new(512, 512)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#153e33'), 1.5)
$path = [Drawing.Drawing2D.GraphicsPath]::new()
try {
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#f6f7f3'))
    $graphics.TranslateTransform(64, 64)
    $graphics.ScaleTransform(16, 16)
    $pen.StartCap = $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawLine($pen, 3, 21, 21, 21)
    $points = [Drawing.PointF[]]@(
        [Drawing.PointF]::new(4,21), [Drawing.PointF]::new(4,10),
        [Drawing.PointF]::new(6.5,5.5), [Drawing.PointF]::new(12,3),
        [Drawing.PointF]::new(17.5,5.5), [Drawing.PointF]::new(20,10),
        [Drawing.PointF]::new(20,21)
    )
    $graphics.DrawLines($pen, $points)
    $graphics.DrawEllipse($pen, 10, 7, 4, 4)
    $path.AddLine(9,21,9,16)
    $path.AddArc(9,15,2,2,180,90)
    $path.AddLine(10,15,14,15)
    $path.AddArc(13,15,2,2,270,90)
    $path.AddLine(15,16,15,21)
    $graphics.DrawPath($pen, $path)
    $output = [Drawing.Bitmap]::new(128,128)
    $resize = [Drawing.Graphics]::FromImage($output)
    try {
        $resize.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $resize.DrawImage($bitmap,0,0,128,128)
        $output.Save((Join-Path $iconRoot 'icon.png'),[Drawing.Imaging.ImageFormat]::Png)
    } finally { $resize.Dispose(); $output.Dispose() }
} finally { $path.Dispose(); $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
