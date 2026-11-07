param([int]$IntervalMs = 1800)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
while ($true) {
  $brightness = $null
  try {
    $b = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $b) { $brightness = [int]$b.CurrentBrightness }
  } catch {}
  $state = [ordered]@{
    brightness = $brightness
    capsLock = [bool][Console]::CapsLock
    numLock = [bool][Console]::NumberLock
    ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  }
  [Console]::WriteLine(($state | ConvertTo-Json -Compress))
  Start-Sleep -Milliseconds $IntervalMs
}
