param([string]$Target, [switch]$NonInteractive, [switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$download = $null
try {
    if (!$Target) {
        if ($NonInteractive) { throw 'Provide -Target for unattended updates.' }
        $Target = Join-Path $PSScriptRoot 'Prism Studio.exe'
        if (!(Test-Path -LiteralPath $Target -PathType Leaf)) {
            $picker = New-Object System.Windows.Forms.OpenFileDialog
            $picker.Title = 'Choose your existing Prism Studio executable'
            $picker.Filter = 'Prism Studio executable (*.exe)|*.exe'
            if ($picker.ShowDialog() -ne 'OK') { exit }
            $Target = $picker.FileName
        }
    }
    $Target = (Resolve-Path -LiteralPath $Target).Path
    $info = [Diagnostics.FileVersionInfo]::GetVersionInfo($Target)
    if ($info.ProductName -ne 'Prism Studio') { throw 'Choose a Prism Studio executable, not Prism Launcher or its installer.' }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/KiraDiamond/Prism-Studio/releases/latest' -Headers @{'User-Agent'='Prism-Studio-Updater';'Accept'='application/vnd.github+json'} -TimeoutSec 30
    if ($release.tag_name -notmatch '^v(\d+\.\d+\.\d+)$') { throw 'The latest release has an unsupported version.' }
    $latest = [version]$Matches[1]
    $current = [version]($info.ProductVersion -replace '^(\d+\.\d+\.\d+).*$', '$1')
    if ($latest -le $current) {
        if ($NonInteractive) { Write-Output "Prism Studio $current is up to date." }
        else { [Windows.Forms.MessageBox]::Show("Prism Studio $current is up to date.",'Prism Studio') | Out-Null }
        exit
    }
    $asset = @($release.assets | Where-Object { $_.name -eq 'Prism-Studio.exe' })
    if ($asset.Count -ne 1 -or $asset[0].digest -notmatch '^sha256:[a-fA-F0-9]{64}$') { throw 'The release is missing its verified executable. Please try again later.' }
    $asset = $asset[0]
    $url = [Uri]$asset.browser_download_url
    if ($url.Scheme -ne 'https' -or $url.Host -ne 'github.com' -or !$url.AbsolutePath.StartsWith('/KiraDiamond/Prism-Studio/releases/download/')) { throw 'The release download address is not trusted.' }
    if (!$NonInteractive) {
        $answer = [Windows.Forms.MessageBox]::Show("Update Prism Studio from $current to $latest?`n`nStudio will close and reopen. Your settings and skin packs are kept.",'Prism Studio update','YesNo','Question')
        if ($answer -ne 'Yes') { exit }
    }
    $download = Join-Path ([IO.Path]::GetDirectoryName($Target)) ('.prism-update-' + [Guid]::NewGuid().ToString('N') + '.exe')
    Invoke-WebRequest -UseBasicParsing -Uri $url.AbsoluteUri -OutFile $download -TimeoutSec 120
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($download)
    try { $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($digest -ne $asset.digest.Substring(7)) { throw 'Download verification failed. Your existing app has not been changed.' }
    $newInfo = [Diagnostics.FileVersionInfo]::GetVersionInfo($download)
    if ($newInfo.ProductName -ne 'Prism Studio' -or [version]($newInfo.ProductVersion -replace '^(\d+\.\d+\.\d+).*$', '$1') -ne $latest) { throw 'The downloaded executable does not match this release.' }
    $running = @(Get-Process | Where-Object { $_.Path -eq $Target })
    foreach ($process in $running) {
        $process.CloseMainWindow() | Out-Null
        if (!$process.WaitForExit(15000)) { throw 'Close Prism Studio, then run the updater again. No files were replaced.' }
    }
    $backup = $Target + '.previous-' + [Guid]::NewGuid().ToString('N') + '.bak'
    [IO.File]::Replace($download, $Target, $backup)
    $download = $null
    if (!$NoLaunch) { Start-Process -FilePath $Target -WindowStyle Hidden }
    if ($NonInteractive) { Write-Output "Updated Prism Studio to $latest. Previous EXE retained at $backup" }
} catch {
    if ($NonInteractive) { Write-Output "Update failed: $($_.Exception.Message)" }
    else { [Windows.Forms.MessageBox]::Show("Update could not finish: $($_.Exception.Message)`n`nYou can also download the latest release from github.com/KiraDiamond/Prism-Studio/releases.",'Prism Studio update','OK','Error') | Out-Null }
    exit 1
} finally {
    if ($download -and (Test-Path -LiteralPath $download)) { Remove-Item -LiteralPath $download -Force }
}
