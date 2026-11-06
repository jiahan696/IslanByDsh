# Liquid Island - system media session bridge (read side)
# Polls the Windows Global System Media Transport Controls (SMTC) session and
# writes one compact JSON object per line to stdout. Read-only: playback control
# lives in media-control.ps1 so a hung control action cannot stall the sampler.
param([int]$IntervalMs = 800)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($WinRtTask, $ResultType) {
  try {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    if (-not $netTask.Wait(6000)) { return $null }
    return $netTask.Result
  } catch {
    return $null
  }
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

if ($null -eq $manager) {
  [Console]::WriteLine((@{ hasSession = $false; ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds(); error = 'manager-unavailable' } | ConvertTo-Json -Compress))
  exit 0
}

while ($true) {
  $state = [ordered]@{
    hasSession = $false
    ts         = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    appId      = $null
    title      = $null
    artist     = $null
    album      = $null
    playing    = $false
    positionMs = 0
    durationMs = 0
    canPrev    = $false
    canNext    = $false
    canPause   = $false
  }

  try {
    $session = $manager.GetCurrentSession()
    if ($null -ne $session) {
      $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $info = $session.GetPlaybackInfo()
      $timeline = $session.GetTimelineProperties()

      if ($null -ne $props) {
        $state.hasSession = $true
        $state.appId = $session.SourceAppUserModelId
        $state.title = $props.Title
        $state.artist = $props.Artist
        $state.album = $props.AlbumTitle
        $state.playing = ($info.PlaybackStatus.ToString() -eq 'Playing')
        $state.positionMs = [long]$timeline.Position.TotalMilliseconds
        $state.durationMs = [long]$timeline.EndTime.TotalMilliseconds
        if ($state.durationMs -le 0) {
          $state.durationMs = [long]($timeline.MaxSeekTime.TotalMilliseconds)
        }
        $state.canPrev = [bool]$info.Controls.IsPreviousEnabled
        $state.canNext = [bool]$info.Controls.IsNextEnabled
        $state.canPause = [bool]$info.Controls.IsPauseEnabled -or [bool]$info.Controls.IsPlayEnabled
      }
    }
  } catch {
    $state.hasSession = $false
  }

  $json = $state | ConvertTo-Json -Compress
  [Console]::WriteLine($json)
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds $IntervalMs
}
