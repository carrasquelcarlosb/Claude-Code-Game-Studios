# Release build for ROUND 13.
# Copies src/ into dist/round13/, hard-disables the ?debug tools in the copy,
# and zips it with index.html at the zip root (what itch.io expects for HTML5).
# Usage: powershell -ExecutionPolicy Bypass -File tools/build.ps1
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$src = Join-Path $root 'src'
$dist = Join-Path $root 'dist'
$out = Join-Path $dist 'round13'
$zip = Join-Path $dist 'round13-web.zip'

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
if (Test-Path $zip) { Remove-Item -Force $zip }
New-Item -ItemType Directory -Force $out | Out-Null

# Copy the game, leaving out dev-only files.
Copy-Item -Recurse -Path (Join-Path $src '*') -Destination $out
foreach ($f in @('CLAUDE.md', '.gitkeep')) { Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $out $f) }

# Strip debug: the source enables it with ?debug; the release never does.
$main = Join-Path $out 'js\main.js'
$text = [IO.File]::ReadAllText($main)
$needle = "const DEBUG = new URLSearchParams(location.search).has('debug');"
if (-not $text.Contains($needle)) { throw "Debug flag not found in main.js; refusing to ship a build with debug tools." }
$text = $text.Replace($needle, 'const DEBUG = false; // stripped by tools/build.ps1')
[IO.File]::WriteAllText($main, $text, (New-Object Text.UTF8Encoding($false)))

# Zip with index.html at the root. Not Compress-Archive: on Windows PowerShell
# 5.1 it writes backslash paths (js\main.js), which break on Linux hosts.
Add-Type -AssemblyName System.IO.Compression.FileSystem
# ZipFile.CreateFromDirectory also writes backslashes on .NET Framework, so add
# each file ourselves with a forward-slash entry name.
Add-Type -AssemblyName System.IO.Compression
$outFull = (Resolve-Path $out).Path.TrimEnd('\') + '\'
$writer = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in Get-ChildItem -Recurse -File $out) {
    $name = $file.FullName.Substring($outFull.Length).Replace([char]92, '/')
    $entry = $writer.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
    $dst = $entry.Open(); $srcStream = [IO.File]::OpenRead($file.FullName)
    try { $srcStream.CopyTo($dst) } finally { $srcStream.Dispose(); $dst.Dispose() }
  }
} finally { $writer.Dispose() }
# Fail the build if any entry still uses backslashes.
$archive = [IO.Compression.ZipFile]::OpenRead($zip)
try {
  $bad = @($archive.Entries | Where-Object { $_.FullName.Contains([char]92) })
  if ($bad.Count) { throw "Zip has backslash paths: $($bad[0].FullName)" }
  if (-not ($archive.Entries | Where-Object { $_.FullName -eq 'index.html' })) { throw 'index.html is not at the zip root.' }
} finally { $archive.Dispose() }

$files = (Get-ChildItem -Recurse -File $out).Count
$size = [math]::Round((Get-Item $zip).Length / 1MB, 2)
Write-Host "Built $out ($files files)"
Write-Host "Zipped $zip ($size MB)"
