# Liquid Island - media transport control (write side).
# One-shot: connects to the current SMTC session, applies a single command and
# exits. Position is expressed in milliseconds (converted to 100ns ticks).
param(
  [ValidateSet('playpause', 'next', 'previous', 'seek')]
  [string]$Action = 'playpause',
  [long]$PositionMs = 0
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(8000) | Out-Null
  return $netTask.Result
}

function Reply($ok, $message) {
  @{ ok = [bool]$ok; message = $message } | ConvertTo-Json -Compress
  exit 0
}

try {
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  $manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  if ($null -eq $manager) { Reply $false 'manager-unavailable' }

  $session = $manager.GetCurrentSession()
  if ($null -eq $session) { Reply $false 'no-session' }

  switch ($Action) {
    'playpause' {
      $ok = Await ($session.TryTogglePlayPauseAsync()) ([bool])
      Reply $ok 'toggle'
    }
    'next' {
      $ok = Await ($session.TrySkipNextAsync()) ([bool])
      Reply $ok 'next'
    }
    'previous' {
      $ok = Await ($session.TrySkipPreviousAsync()) ([bool])
      Reply $ok 'previous'
    }
    'seek' {
      # TryChangePlaybackPositionAsync expects 100-nanosecond ticks.
      $ticks = [long]($PositionMs * 10000)
      $ok = Await ($session.TryChangePlaybackPositionAsync($ticks)) ([bool])
      Reply $ok 'seek'
    }
    default { Reply $false 'unknown-action' }
  }
} catch {
  Reply $false $_.Exception.Message
}
