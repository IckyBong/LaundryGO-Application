# =========================================================================
# LaundryGO Mobile Web - Local Development Server
# =========================================================================

$port = 8082
$url = "http://localhost:$port"
$directory = $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       LAUNDRYGO - SMART LAUNDRY LOCKER MOBILE WEB        " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Folder Project   : $directory" -ForegroundColor Gray
Write-Host "Akses Desktop    : $url" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
    Write-Host "Server aktif di http://localhost:$port/ ..." -ForegroundColor Green

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($localPath)) {
            $localPath = "index.html"
        }

        # Handle URL encoded characters & paths
        $localPath = [System.Uri]::UnescapeDataString($localPath)
        $filePath = Join-Path $directory $localPath

        if (Test-Path $filePath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = "text/plain"
            switch ($ext) {
                ".html" { $mime = "text/html; charset=utf-8" }
                ".css"  { $mime = "text/css; charset=utf-8" }
                ".js"   { $mime = "application/javascript; charset=utf-8" }
                ".jsx"  { $mime = "application/javascript; charset=utf-8" }
                ".json" { $mime = "application/json; charset=utf-8" }
                ".png"  { $mime = "image/png" }
                ".jpg"  { $mime = "image/jpeg" }
                ".svg"  { $mime = "image/svg+xml" }
            }

            $response.ContentType = $mime
            $response.ContentLength64 = $content.Length
            
            # CORS Headers for Local Mobile Testing
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.AddHeader("Access-Control-Allow-Headers", "*")
            
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $localPath")
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $response.Close()
    }
} catch {
    Write-Host "Server stopped or error: $_" -ForegroundColor Yellow
} finally {
    if ($listener -and $listener.IsListening) {
        $listener.Stop()
    }
}
