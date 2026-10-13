# Minimal static file server for the R13 browser build. Development only;
# it is not part of the release zip.
# Usage: powershell -ExecutionPolicy Bypass -File tools/serve.ps1 [-Port 8013] [-Root src] [-AllowSave]
#   -Root dist/round13 serves the release build made by tools/build.ps1.
#   -AllowSave accepts POST /__save/<name>.png (a PNG body) and writes it to
#     production/marketing/<name>.png, for capturing marketing renders.
param([int]$Port = 8013, [string]$Root = 'src', [switch]$AllowSave)

$repo = Join-Path $PSScriptRoot '..' | Resolve-Path
$root = Join-Path $repo $Root | Resolve-Path
$saveDir = Join-Path $repo 'production\marketing'
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json'; '.css' = 'text/css'; '.png' = 'image/png'
  '.wav' = 'audio/wav'; '.ogg' = 'audio/ogg'; '.svg' = 'image/svg+xml'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "R13 serving $root at http://localhost:$Port/"
if ($AllowSave) { Write-Host "Saving POST /__save/<name>.png to $saveDir" }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))

  if ($AllowSave -and $req.HttpMethod -eq 'POST' -and $rel -like '__save/*') {
    # Only a plain file name ending in .png, written into production/marketing.
    $name = $rel.Substring(7)
    if ($name -match '^[A-Za-z0-9_-]+\.png$') {
      New-Item -ItemType Directory -Force $saveDir | Out-Null
      $ms = New-Object IO.MemoryStream
      $req.InputStream.CopyTo($ms)
      $bytes = $ms.ToArray()
      # PNG signature check: 89 50 4E 47.
      if ($bytes.Length -gt 8 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47) {
        [IO.File]::WriteAllBytes((Join-Path $saveDir $name), $bytes)
        Write-Host "Saved $name ($($bytes.Length) bytes)"
        $res.StatusCode = 204
      } else { $res.StatusCode = 415 }
    } else { $res.StatusCode = 400 }
    $res.Close()
    continue
  }

  if ($rel -eq '') { $rel = 'index.html' }
  $path = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
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
