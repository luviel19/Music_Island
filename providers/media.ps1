# Мост к системному медиа-контролю Windows (SMTC).
# Раз в ~700 мс печатает в stdout одну JSON-строку с текущим треком, команды читает из stdin
# (по строке JSON: {"type":"toggle"|"next"|"prev"|"seek","value":мс}). Файл намеренно только ASCII.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, $type) {
    try {
        $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
        if ($task.Wait(5000)) { return $task.Result }
    } catch { }
    return $null
}

function Emit($o) {
    [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
}

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if (-not $mgr) { Emit @{ active = $false; error = 'no-manager' } }

function Get-Thumb($props) {
    try {
        if (-not $props.Thumbnail) { return '' }
        $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        if (-not $stream) { return '' }
        $size = [uint32]$stream.Size
        if ($size -eq 0 -or $size -gt 8000000) { return '' }
        $mime = $stream.ContentType
        $reader = [Windows.Storage.Streams.DataReader]::new($stream)
        [void](Await ($reader.LoadAsync($size)) ([uint32]))
        $bytes = New-Object byte[] $size
        $reader.ReadBytes($bytes)
        $reader.Dispose(); $stream.Dispose()
        return 'data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes)
    } catch { return '' }
}

$script:lastKey = $null
$script:needThumb = $false
$script:thumbTries = 0

function Get-State {
    $s = $mgr.GetCurrentSession()
    if (-not $s) { return @{ active = $false } }
    $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    if (-not $props -or -not $props.Title) { return @{ active = $false } }
    $playing = ($s.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing')
    $tl = $s.GetTimelineProperties()
    $dur = ($tl.EndTime - $tl.StartTime).TotalMilliseconds
    $pos = ($tl.Position - $tl.StartTime).TotalMilliseconds
    if ($playing -and $tl.LastUpdatedTime.Year -gt 2000) { $pos += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalMilliseconds }
    if ($dur -lt 0) { $dur = 0 }
    if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }
    if ($pos -lt 0) { $pos = 0 }
    $id = [string]$s.SourceAppUserModelId
    if ($id -match '^(.+?)_[^!]+!(.+)$') {
        $app = $matches[2]
        if ($app -eq 'App') { $app = ($matches[1] -split '\.')[-1] }
    } else { $app = $id -replace '\.exe$', '' }
    $o = [ordered]@{
        active = $true; app = $app; title = $props.Title; artist = $props.Artist; album = $props.AlbumTitle
        playing = $playing; posMs = [math]::Round($pos); durMs = [math]::Round($dur)
    }
    $key = "$($s.SourceAppUserModelId)|$($props.Title)|$($props.Artist)"
    if ($key -ne $script:lastKey) {
        $script:lastKey = $key
        $o.thumb = Get-Thumb $props
        $script:needThumb = ($o.thumb -eq '')
        $script:thumbTries = 0
    } elseif ($script:needThumb -and $script:thumbTries -lt 8) {
        $script:thumbTries++
        $t = Get-Thumb $props
        if ($t -ne '') { $o.thumb = $t; $script:needThumb = $false }
    }
    return $o
}

function Invoke-Cmd($c) {
    $s = $mgr.GetCurrentSession()
    if (-not $s) { return }
    switch ($c.type) {
        'toggle' { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
        'next'   { [void](Await ($s.TrySkipNextAsync()) ([bool])) }
        'prev'   { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) }
        'seek'   { [void](Await ($s.TryChangePlaybackPositionAsync([long]([double]$c.value * 10000))) ([bool])) }
    }
}

$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
$cmdTask = $stdin.ReadLineAsync()
$sw = [Diagnostics.Stopwatch]::StartNew()
$lastEmit = -1000
while ($true) {
    if ($cmdTask.IsCompleted) {
        $line = $cmdTask.Result
        if ($null -eq $line) { break }          # родитель закрыл stdin - выходим
        $cmdTask = $stdin.ReadLineAsync()
        try { Invoke-Cmd ($line | ConvertFrom-Json) } catch { }
        $lastEmit = -1000
    }
    if ($sw.ElapsedMilliseconds - $lastEmit -ge 700) {
        $lastEmit = $sw.ElapsedMilliseconds
        try { Emit (Get-State) } catch { Emit @{ active = $false } }
    }
    Start-Sleep -Milliseconds 80
}
