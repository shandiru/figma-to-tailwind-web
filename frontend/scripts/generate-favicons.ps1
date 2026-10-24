param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\public')
)

Add-Type -AssemblyName System.Drawing

function New-FrameToCodeIcon {
  param(
    [Parameter(Mandatory = $true)][int]$Size,
    [Parameter(Mandatory = $true)][string]$FileName
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $Size / 64.0
  $radius = 12 * $scale
  $diameter = $radius * 2
  $bounds = [System.Drawing.RectangleF]::new(0, 0, $Size, $Size)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($bounds.Left, $bounds.Top, $diameter, $diameter, 180, 90)
  $path.AddArc($bounds.Right - $diameter, $bounds.Top, $diameter, $diameter, 270, 90)
  $path.AddArc($bounds.Right - $diameter, $bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($bounds.Left, $bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#7c3aed'))
  $graphics.FillPath($background, $path)

  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 4 * $scale)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Square
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Square
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter

  $segments = @(
    @(25, 15, 15, 15), @(15, 15, 15, 49), @(15, 49, 25, 49),
    @(39, 15, 49, 15), @(49, 15, 49, 49), @(49, 49, 39, 49),
    @(27, 25, 20, 32), @(20, 32, 27, 39),
    @(37, 25, 44, 32), @(44, 32, 37, 39)
  )
  foreach ($segment in $segments) {
    $graphics.DrawLine($pen, $segment[0] * $scale, $segment[1] * $scale, $segment[2] * $scale, $segment[3] * $scale)
  }

  $target = Join-Path $OutputDirectory $FileName
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose()
  $background.Dispose()
  $path.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-FrameToCodeIcon -Size 48 -FileName 'favicon-48x48.png'
New-FrameToCodeIcon -Size 180 -FileName 'apple-touch-icon.png'
New-FrameToCodeIcon -Size 192 -FileName 'icon-192.png'
New-FrameToCodeIcon -Size 512 -FileName 'icon-512.png'
