# Lightweight local server for AR Living Memory testing
$port = 8080
$folder = $PSScriptRoot

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
$listener.Start()
Write-Host "AR Living Memory server running at http://localhost:$port/"

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        [System.Threading.ThreadPool]::QueueUserWorkItem({
            param($c)
            try {
                $stream = $c.GetStream()
                $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII)
                $line = $reader.ReadLine()
                if (-not $line) { $c.Close(); return }

                $parts = $line.Split(" ")
                $path = $parts[1].Split("?")[0].TrimStart("/")
                if (-not $path) { $path = "index.html" }

                $fullPath = [System.IO.Path]::Combine($using:folder, $path.Replace("/", "\"))

                if ([System.IO.File]::Exists($fullPath)) {
                    $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
                    $mime = switch ($ext) {
                        ".html" { "text/html" }
                        ".js"   { "application/javascript" }
                        ".css"  { "text/css" }
                        ".json" { "application/json" }
                        ".jpg"  { "image/jpeg" }
                        ".jpeg" { "image/jpeg" }
                        ".png"  { "image/png" }
                        ".mp4"  { "video/mp4" }
                        ".mind" { "application/octet-stream" }
                        default { "application/octet-stream" }
                    }

                    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                    $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
                    $hBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                    $stream.Write($hBytes, 0, $hBytes.Length)
                    $stream.Write($bytes, 0, $bytes.Length)
                } else {
                    $h404 = "HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
                    $b404 = [System.Text.Encoding]::ASCII.GetBytes($h404)
                    $stream.Write($b404, 0, $b404.Length)
                }
            } catch {}
            finally { $c.Close() }
        }, $client) | Out-Null
    }
} finally {
    $listener.Stop()
}
