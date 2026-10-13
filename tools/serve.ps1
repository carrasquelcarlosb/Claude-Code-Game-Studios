# Minimal static file server for the ROUND 13 browser build.
# Usage: powershell -ExecutionPolicy Bypass -File tools/serve.ps1 [-Port 8013] [-Root src]
#   -Root dist/round13 serves the release build made by tools/build.ps1.
param([int]$Port = 8013, [string]$Root = 'src')

$root = Join-Path (Join-Path $PSScriptRoot '..') $Root | Resolve-Path
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json'; '.css' = 'text/css'; '.png' = 'image/png'
  '.wav' = 'audio/wav'; '.ogg' = 'audio/ogg'; '.svg' = 'image/svg+xml'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "ROUND 13 serving $root at http://localhost:$Port/"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($rel -eq '') { $rel = 'index.html' }
  $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
  $res = $ctx.Response
  if ($path.StartsWith($root.Path) -and (Test-Path $path -PathType Leaf)) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    $res.Headers.Add('Cache-Control', 'no-store')
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
  }
  $res.Close()
}
