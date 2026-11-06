# Liquid Island - installed application inventory.
# Reads the three standard Uninstall registry hives (the same source Bulk Crap
# Uninstaller starts from) plus per-user AppX packages. Writes a UTF-8 JSON file
# so the Electron main process never has to parse console-encoded text.
param(
  [Parameter(Mandatory = $true)][string]$OutFile,
  [switch]$IncludeStore
)

$ErrorActionPreference = 'SilentlyContinue'
$apps = New-Object System.Collections.ArrayList
$seen = @{}

function Get-StableId([string]$seed) {
  $sha = [System.Security.Cryptography.SHA1]::Create()
  $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($seed))
  return ([System.BitConverter]::ToString($hash) -replace '-', '').Substring(0, 16)
}

function Expand-Env([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return '' }
  try { return [System.Environment]::ExpandEnvironmentVariables($value).Trim() } catch { return $value.Trim() }
}

$hives = @(
  @{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'; Hive = 'machine' },
  @{ Path = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'; Hive = 'machine' },
  @{ Path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'; Hive = 'user' }
)

foreach ($hive in $hives) {
  Get-ItemProperty -Path $hive.Path -ErrorAction SilentlyContinue | ForEach-Object {
    if ([string]::IsNullOrWhiteSpace($_.DisplayName)) { return }
    if ($_.SystemComponent -eq 1 -or $_.NoRemove -eq 1) { return }
    if (-not [string]::IsNullOrWhiteSpace($_.ParentKeyName)) { return }
    if ($_.ReleaseType -in @('Update', 'Hotfix', 'Security Update', 'Update Rollup')) { return }
    if ($_.DisplayName -match '^(Update for|Security Update for|Hotfix for|KB\d{6,})') { return }

    $name = $_.DisplayName.Trim()
    $version = if ($_.DisplayVersion) { [string]$_.DisplayVersion } else { '' }
    $publisher = if ($_.Publisher) { [string]$_.Publisher } else { '' }
    $installLocation = Expand-Env ([string]$_.InstallLocation)
    $uninstall = if ($_.UninstallString) { [string]$_.UninstallString } else { '' }
    $quiet = if ($_.QuietUninstallString) { [string]$_.QuietUninstallString } else { '' }
    if ([string]::IsNullOrWhiteSpace($uninstall) -and [string]::IsNullOrWhiteSpace($quiet)) { return }

    $dedupe = ("$name|$version|$publisher").ToLowerInvariant()
    if ($seen.ContainsKey($dedupe)) { return }
    $seen[$dedupe] = $true

    $displayIcon = Expand-Env ([string]$_.DisplayIcon)
    $displayIcon = ($displayIcon -replace ',\s*-?\d+$', '').Trim('"').Trim()

    $size = $null
    if ($_.EstimatedSize -is [int] -or $_.EstimatedSize -is [long]) { $size = [long]$_.EstimatedSize }

    $systemComponent = ($_.SystemComponent -eq 1)
    $needsElevation = ($hive.Hive -eq 'machine') -or ($installLocation -match '(?i)^[A-Z]:\\Program Files|^[A-Z]:\\Windows')

    [void]$apps.Add([pscustomobject]@{
      id                 = 'reg-' + (Get-StableId ([string]$_.PSPath))
      name               = $name
      version            = $version
      publisher          = $publisher
      installLocation    = $installLocation
      uninstallString    = $uninstall
      quietUninstallString = $quiet
      estimatedSizeKb    = $size
      displayIcon        = $displayIcon
      source             = 'registry'
      hive               = $hive.Hive
      systemComponent    = $systemComponent
      packageFullName    = $null
      requiresElevation  = [bool]$needsElevation
    })
  }
}

if ($IncludeStore) {
  # Get-AppxPackage only exposes the package identity. The user-facing name
  # lives in the Start menu entry (AppID = <PackageFamilyName>!<AppId>), so build
  # that map once and skip Store packages that never appear in Start.
  $startNames = @{}
  Get-StartApps -ErrorAction SilentlyContinue | ForEach-Object {
    $family = ([string]$_.AppID).Split('!')[0]
    if (-not [string]::IsNullOrWhiteSpace($family) -and -not $startNames.ContainsKey($family)) {
      $startNames[$family] = [string]$_.Name
    }
  }

  Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object {
    -not $_.IsFramework -and -not $_.IsResourcePackage -and $_.SignatureKind -ne 'System' -and
    $_.Name -notmatch '^(Microsoft\.(Windows|VCLibs|UI\.Xaml|NET|DesktopAppInstaller|Services|StorePurchaseApp|WindowsStore))'
  } | ForEach-Object {
    $family = [string]$_.PackageFamilyName
    $friendly = $startNames[$family]
    if ([string]::IsNullOrWhiteSpace($friendly)) { return }

    $dedupe = ('appx|' + $family).ToLowerInvariant()
    if ($seen.ContainsKey($dedupe)) { return }
    $seen[$dedupe] = $true

    [void]$apps.Add([pscustomobject]@{
      id                 = 'appx-' + (Get-StableId ([string]$_.PackageFullName))
      name               = $friendly
      version            = [string]$_.Version
      publisher          = [string]$_.PublisherDisplayName
      installLocation    = [string]$_.InstallLocation
      uninstallString    = ''
      quietUninstallString = ''
      estimatedSizeKb    = $null
      displayIcon        = ''
      source             = 'store'
      hive               = 'store'
      systemComponent    = $false
      packageFullName    = [string]$_.PackageFullName
      requiresElevation  = $false
    })
  }
}

$sorted = @($apps | Sort-Object name)
$payload = [pscustomobject]@{
  generatedAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
  count       = $sorted.Count
  apps        = $sorted
}

$json = $payload | ConvertTo-Json -Depth 5 -Compress
[System.IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding($false)))
