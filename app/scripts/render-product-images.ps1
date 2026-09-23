param(
  [Parameter(Mandatory = $true)][string]$Manifest,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)

Add-Type -AssemblyName System.Drawing.Common
$products = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
$generated = 0

foreach ($product in $products) {
  $bitmap = [System.Drawing.Bitmap]::new(720, 720)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  try {
    $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f8fafc'))
    $accent = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($product.color))
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $primaryText = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0f172a'))
    $secondaryText = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#64748b'))
    $whitePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 20)
    $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $graphics.FillRectangle($background, 0, 0, 720, 720)
    $graphics.FillEllipse($accent, 190, 100, 340, 340)
    $graphics.FillRectangle($accent, 218, 132, 284, 284)
    $graphics.DrawLine($whitePen, 278, 214, 442, 214)
    $graphics.DrawLine($whitePen, 278, 214, 296, 356)
    $graphics.DrawLine($whitePen, 442, 214, 424, 356)
    $graphics.DrawLine($whitePen, 296, 356, 424, 356)
    $graphics.DrawArc($whitePen, 316, 168, 88, 92, 180, 180)

    $initialFont = [System.Drawing.Font]::new('Arial', 74, [System.Drawing.FontStyle]::Bold)
    $nameFont = [System.Drawing.Font]::new('Arial', 34, [System.Drawing.FontStyle]::Bold)
    $codeFont = [System.Drawing.Font]::new('Arial', 20, [System.Drawing.FontStyle]::Regular)
    $center = [System.Drawing.StringFormat]::new()
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $center.LineAlignment = [System.Drawing.StringAlignment]::Center

    $graphics.DrawString($product.initial, $initialFont, $white, [System.Drawing.RectangleF]::new(218, 210, 284, 120), $center)
    $graphics.DrawString($product.name, $nameFont, $primaryText, [System.Drawing.RectangleF]::new(70, 470, 580, 100), $center)
    $graphics.DrawString($product.code, $codeFont, $secondaryText, [System.Drawing.RectangleF]::new(70, 590, 580, 45), $center)

    $output = Join-Path $OutputDirectory $product.file
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
    $generated += 1
  }
  finally {
    foreach ($resource in @($background, $accent, $white, $primaryText, $secondaryText, $whitePen, $initialFont, $nameFont, $codeFont, $center, $graphics, $bitmap)) {
      if ($null -ne $resource) { $resource.Dispose() }
    }
  }
}

Write-Output "$generated imagens PNG geradas."
