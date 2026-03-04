# build-xpi.ps1 — Build .xpi with correct forward-slash paths
# Usage: powershell -ExecutionPolicy Bypass -File .\build-xpi.ps1

param(
    [string]$SourceDir = $PWD,
    [string]$OutputFile = "spam-trash-cleaner.xpi"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$xpiPath = Join-Path $SourceDir $OutputFile
if (Test-Path $xpiPath) { Remove-Item $xpiPath -Force }

# Files to include (relative paths with forward slashes)
$filesToInclude = @(
    "manifest.json",
    "background.js",
    "popup/popup.html",
    "popup/popup.css",
    "popup/popup.js",
    "icons/icon-16.svg",
    "icons/icon-32.svg",
    "icons/icon-48.svg",
    "icons/icon-128.svg",
    "icons/btn-trash.svg",
    "icons/btn-spam.svg",
    "icons/btn-both.svg",
    "_locales/en/messages.json",
    "_locales/it/messages.json",
    "_locales/zh_CN/messages.json",
    "_locales/zh_TW/messages.json",
    "_locales/hi/messages.json",
    "_locales/es/messages.json",
    "_locales/fr/messages.json",
    "_locales/ar/messages.json",
    "_locales/bn/messages.json",
    "_locales/pt_BR/messages.json",
    "_locales/pt_PT/messages.json",
    "_locales/ru/messages.json",
    "_locales/ja/messages.json",
    "_locales/de/messages.json",
    "_locales/id/messages.json",
    "_locales/ko/messages.json",
    "_locales/tr/messages.json",
    "_locales/vi/messages.json",
    "_locales/pl/messages.json",
    "_locales/nl/messages.json",
    "_locales/th/messages.json",
    "_locales/uk/messages.json",
    "_locales/sw/messages.json"
)

$zip = [System.IO.Compression.ZipFile]::Open($xpiPath, [System.IO.Compression.ZipArchiveMode]::Create)

try {
    foreach ($relPath in $filesToInclude) {
        $entryName = $relPath.Replace('\', '/')
        $fullPath = Join-Path $SourceDir ($relPath.Replace('/', '\'))

        if (-not (Test-Path $fullPath)) {
            Write-Warning "File not found: $fullPath"
            continue
        }

        $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        try {
            $fileStream = [System.IO.File]::OpenRead($fullPath)
            try {
                $fileStream.CopyTo($entryStream)
            } finally {
                $fileStream.Close()
            }
        } finally {
            $entryStream.Close()
        }

        Write-Host "  Added: $entryName"
    }
} finally {
    $zip.Dispose()
}

Write-Host ""
Write-Host "Built: $xpiPath"
Write-Host "Verifying paths inside .xpi:"
$verifyZip = [System.IO.Compression.ZipFile]::OpenRead($xpiPath)
$count = 0
$verifyZip.Entries | ForEach-Object { Write-Host "  $_"; $count++ }
$verifyZip.Dispose()
Write-Host ""
Write-Host "Total files: $count"
