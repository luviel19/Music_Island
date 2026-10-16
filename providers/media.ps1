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

# App filter (embedded Spotify web player). Rules, so that foreign players are never captured:
#  1) a session with our own unique AppUserModelId (filter) is taken as is;
#  2) otherwise only a fallback-app session (any WebView2 host) whose track title is contained in the page title
#     (hint) is taken, and it is remembered (sticky) so that a paused track stays controllable;
#  3) anything else - no session at all.
$script:filter = ''
$script:fallback = ''
$script:hint = ''
$script:own = $false
$script:sticky = ''
$script:selNote = ''
function Get-Key($s) {
    $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    if (-not $p) { return @{ key = ''; title = '' } }
    return @{ key = ([string]$s.SourceAppUserModelId) + '|' + $p.Title + '|' + $p.Artist; title = [string]$p.Title }
}
function Get-Session {
    if (-not $script:filter) { return $mgr.GetCurrentSession() }
    $all = @($mgr.GetSessions())
    $own = @($all | Where-Object { ([string]$_.SourceAppUserModelId) -eq $script:filter })
    if ($own.Count -gt 0) {
        $script:selNote = 'own:' + $own.Count
        $pl = $own | Where-Object { $_.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing' } | Select-Object -First 1
        if ($pl) { return $pl }
        return $own | Select-Object -First 1
    }
    if (-not $script:fallback) { $script:selNote = 'none'; return $null }
    $cand = @($all | Where-Object { ([string]$_.SourceAppUserModelId) -like ('*' + $script:fallback + '*') })
    $script:selNote = 'fallback:' + $cand.Count
    # exactly one WebView2 session while our own player has live audio: that session is ours
    if ($script:own -and $cand.Count -eq 1) { $k1 = Get-Key $cand[0]; $script:sticky = $k1.key; return $cand[0] }
    foreach ($s in $cand) {
        $k = Get-Key $s
        if ($k.title -and $script:hint -and $script:hint.Contains($k.title)) { $script:sticky = $k.key; return $s }
    }
    if ($script:sticky) {
        foreach ($s in $cand) { if ((Get-Key $s).key -eq $script:sticky) { return $s } }
    }
    $script:selNote = 'ambiguous:' + $cand.Count
    return $null
}

function Get-State {
    $s = Get-Session
    if (-not $s) { return @{ active = $false; note = $script:selNote } }
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
        note = $script:selNote; aumid = $id; active = $true; app = $app; title = $props.Title; artist = $props.Artist; album = $props.AlbumTitle
        shuffle = $s.GetPlaybackInfo().IsShuffleActive; repeat = [string]$s.GetPlaybackInfo().AutoRepeatMode
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
    if ($c.type -eq 'filter') { $script:filter = [string]$c.value; $script:fallback = [string]$c.fallback; $script:sticky = ''; $script:lastKey = $null; return }
    if ($c.type -eq 'hint') { $script:hint = [string]$c.value; return }
    if ($c.type -eq 'own') { $script:own = [bool]$c.value; return }
    $s = Get-Session
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
