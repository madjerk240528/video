# Pure .NET TcpListener Web Server - Zero Admin Rights Required
# Works on all Windows versions (PowerShell 5.1 & PowerShell 7+)
$port = 8080
$folder = $PSScriptRoot

$localIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*","Ethernet*" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress -First 1)
if (-not $localIp) {
    $localIp = "127.0.0.1"
}

$server = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)

try {
    $server.Start()
} catch {
    Write-Host "Port $port might be in use. Trying port 8081..." -ForegroundColor Yellow
    $port = 8081
    $server = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
    $server.Start()
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Living Photo AR - Local Server Running!" -ForegroundColor Yellow
Write-Host "  Desktop Creator: http://localhost:$port/index.html" -ForegroundColor Green
Write-Host "  Scanner App:     http://localhost:$port/scan.html" -ForegroundColor Green
Write-Host "  Print Studio:    http://localhost:$port/studio.html" -ForegroundColor Green
Write-Host "  Mobile / WiFi:   http://$localIp`:$port/scan.html" -ForegroundColor Magenta
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Press Ctrl+C in this window to stop the server.`n"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".mp4"  = "video/mp4"
    ".mind" = "application/octet-stream"
}

try {
    while ($true) {
        $client = $server.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII)
        
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) {
            $client.Close()
            continue
        }

        # Parse request line: GET /index.html HTTP/1.1
        $parts = $line -split " "
        $rawPath = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

        # Strip query strings (?v=... &img=...)
        $cleanPath = ($rawPath -split "\?")[0].TrimStart('/')
        if ([string]::IsNullOrEmpty($cleanPath)) {
            $cleanPath = "index.html"
        }

        $filePath = Join-Path $folder $cleanPath

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)

            $header = "HTTP/1.1 200 OK`r`n" +
                      "Content-Type: $mime`r`n" +
                      "Content-Length: $($bytes.Length)`r`n" +
                      "Cache-Control: no-cache, no-store, must-revalidate`r`n" +
                      "Pragma: no-cache`r`n" +
                      "Expires: 0`r`n" +
                      "Access-Control-Allow-Origin: *`r`n" +
                      "Access-Control-Allow-Methods: GET, HEAD, OPTIONS`r`n" +
                      "Access-Control-Allow-Headers: *`r`n" +
                      "Connection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($bytes, 0, $bytes.Length)
        } else {
            $body = "404 Not Found: " + $cleanPath
            $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
            $header = "HTTP/1.1 404 Not Found`r`n" +
                      "Content-Type: text/plain; charset=utf-8`r`n" +
                      "Content-Length: $($bodyBytes.Length)`r`n" +
                      "Access-Control-Allow-Origin: *`r`n" +
                      "Connection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($bodyBytes, 0, $bodyBytes.Length)
        }
        $stream.Flush()
        $client.Close()
    }
} finally {
    $server.Stop()
}
