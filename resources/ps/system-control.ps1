param(
  [ValidateSet('brightness', 'volume', 'mute')]
  [string]$Action = 'brightness',
  [int]$Value = 50
)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LiquidIslandKeys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  public const byte VK_VOLUME_MUTE = 0xAD;
  public const byte VK_VOLUME_DOWN = 0xAE;
  public const byte VK_VOLUME_UP = 0xAF;
}
'@

function Press([byte]$key, [int]$times) {
  for ($i = 0; $i -lt $times; $i++) {
    [LiquidIslandKeys]::keybd_event($key, 0, 0, [UIntPtr]::Zero)
    [LiquidIslandKeys]::keybd_event($key, 0, 2, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 8
  }
}

try {
  if ($Action -eq 'brightness') {
    $methods = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue
    foreach ($method in $methods) {
      $null = Invoke-CimMethod -InputObject $method -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte]([Math]::Max(0, [Math]::Min(100, $Value))) }
    }
    @{ ok = $true; message = 'brightness' } | ConvertTo-Json -Compress
  } elseif ($Action -eq 'volume') {
    # The Windows endpoint API is not exposed to PowerShell by default. Use the
    # native volume keys in deterministic 2% steps (50 steps = 100%).
    $target = [Math]::Max(0, [Math]::Min(100, $Value))
    Press ([LiquidIslandKeys]::VK_VOLUME_DOWN) 55
    Press ([LiquidIslandKeys]::VK_VOLUME_UP) ([int]([Math]::Round($target / 2)))
    @{ ok = $true; message = 'volume'; value = $target } | ConvertTo-Json -Compress
  } else {
    Press ([LiquidIslandKeys]::VK_VOLUME_MUTE) 1
    @{ ok = $true; message = 'mute' } | ConvertTo-Json -Compress
  }
} catch {
  @{ ok = $false; message = $_.Exception.Message } | ConvertTo-Json -Compress
}
