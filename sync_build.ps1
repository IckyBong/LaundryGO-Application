$baseDir = "C:\Users\vicky\.gemini\antigravity\scratch\laundrygo-mobile-web"
$indexPath = Join-Path $baseDir "index.html"
$appPath = Join-Path $baseDir "src\App.jsx"

# Backup
Copy-Item $indexPath (Join-Path $baseDir "index.html.bak") -Force

# Read index.html lines
$lines = [System.IO.File]::ReadAllLines($indexPath, [System.Text.Encoding]::UTF8)

# Find where <script type="text/babel"> starts
$startIndex = -1
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '<script type="text/babel">') {
        $startIndex = $i
        break
    }
}

if ($startIndex -eq -1) {
    Write-Error "Could not find <script type='text/babel'>"
    exit 1
}

$preamble = ($lines[0..$startIndex] -join "`r`n") + "`r`n"
$appJsx = [System.IO.File]::ReadAllText($appPath, [System.Text.Encoding]::UTF8)
$postamble = "`r`n  </script>`r`n</body>`r`n</html>`r`n"

$finalHtml = $preamble + $appJsx + $postamble
[System.IO.File]::WriteAllText($indexPath, $finalHtml, [System.Text.Encoding]::UTF8)

Write-Output "Successfully synced App.jsx to index.html! New length: $($finalHtml.Length)"
