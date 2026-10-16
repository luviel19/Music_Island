# Собирает bin\spotify-host\SpotifyHost.exe (.NET Framework 4.8 есть в Windows 10/11, ставить ничего не нужно).
# Библиотеку Microsoft.Web.WebView2 скачивает из NuGet автоматически.
$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\..\.."
$out = Join-Path $root 'bin\spotify-host'
$ver = '1.0.2903.40'
$tmp = Join-Path $env:TEMP "wv2sdk-$ver"
if (-not (Test-Path "$tmp\lib")) {
    New-Item -ItemType Directory -Force $tmp | Out-Null
    Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$ver/microsoft.web.webview2.$ver.nupkg" -OutFile "$tmp\p.zip"
    Expand-Archive "$tmp\p.zip" $tmp -Force
}
New-Item -ItemType Directory -Force $out | Out-Null
$lib = "$tmp\lib\net462"
Copy-Item "$lib\Microsoft.Web.WebView2.Core.dll", "$lib\Microsoft.Web.WebView2.WinForms.dll", "$tmp\runtimes\win-x64\native\WebView2Loader.dll" $out -Force
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $csc /nologo /target:winexe /platform:x64 /optimize+ /out:"$out\SpotifyHost.exe" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Management.dll `
    /r:"$out\Microsoft.Web.WebView2.Core.dll" /r:"$out\Microsoft.Web.WebView2.WinForms.dll" "$PSScriptRoot\SpotifyHost.cs"
if ($LASTEXITCODE -ne 0) { throw 'csc failed' }
Write-Host "OK: $out\SpotifyHost.exe"
