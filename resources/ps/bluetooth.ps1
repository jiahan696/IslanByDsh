# Liquid Island - Bluetooth accessory inventory (best effort).
# Lists present (i.e. currently connected) Bluetooth peripherals and tries to
# read a battery level reported by the PnP driver. Windows does not expose a
# uniform battery API for every headset; when the driver reports nothing the
# field stays null and the UI explicitly marks it as unavailable.
param([Parameter(Mandatory = $true)][string]$OutFile)

$ErrorActionPreference = 'SilentlyContinue'
$devices = New-Object System.Collections.ArrayList
$seen = @{}

$adapterPattern = '(?i)(adapter|radio|enumerator|service|microsoft bluetooth|generic bluetooth|bluetooth usb|bluetooth module|bluetooth device \(rfcomm\)|bth|hands[- ]?free|avrcp|a2dp)'

$pnpDevices = @()
$pnpDevices += Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue
$pnpDevices += Get-PnpDevice -Class BluetoothLE -PresentOnly -ErrorAction SilentlyContinue

foreach ($device in $pnpDevices) {
  if ($null -eq $device -or $device.Status -ne 'OK') { continue }
  $name = [string]$device.FriendlyName
  if ([string]::IsNullOrWhiteSpace($name) -or $name -match $adapterPattern) { continue }
  if ($seen.ContainsKey($device.InstanceId)) { continue }
  $seen[$device.InstanceId] = $true

  $battery = $null
  $batteryKey = $null
  foreach ($key in @('DEVPKEY_Bluetooth_Battery', 'DEVPKEY_Device_BatteryLevel', 'DEVPKEY_BatteryLevel', 'Battery')) {
    $prop = Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName $key -ErrorAction SilentlyContinue
    if ($null -ne $prop -and $null -ne $prop.Data) {
      $candidate = 0
      if ([int]::TryParse([string]$prop.Data, [ref]$candidate) -and $candidate -ge 0 -and $candidate -le 100) {
        $battery = $candidate
        $batteryKey = $key
        break
      }
    }
  }

  if ($null -eq $battery) {
    # Some drivers expose a vendor property instead; scan all device properties
    # once and accept a 0..100 integer whose key mentions battery.
    $all = Get-PnpDeviceProperty -InstanceId $device.InstanceId -ErrorAction SilentlyContinue
    foreach ($prop in $all) {
      if ($prop.KeyName -notmatch '(?i)battery') { continue }
      $candidate = 0
      if ([int]::TryParse([string]$prop.Data, [ref]$candidate) -and $candidate -ge 0 -and $candidate -le 100) {
        $battery = $candidate
        $batteryKey = [string]$prop.KeyName
        break
      }
    }
  }

  $kind = 'other'
  if ($name -match '(?i)(headphone|headset|earbud|earphone|buds|airpods|speaker|audio|sound|耳机|音箱|扬声器)') { $kind = 'audio' }
  elseif ($name -match '(?i)(keyboard|mouse|trackpad|controller|gamepad|键盘|鼠标|手柄)') { $kind = 'input' }
  elseif ($name -match '(?i)(phone|手机)') { $kind = 'phone' }

  [void]$devices.Add([pscustomobject]@{
    id         = [string]$device.InstanceId
    name       = $name
    kind       = $kind
    battery    = $battery
    batteryKey = $batteryKey
    connected  = $true
  })
}

$payload = [pscustomobject]@{
  generatedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  devices     = @($devices)
}

$json = $payload | ConvertTo-Json -Depth 4 -Compress
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
