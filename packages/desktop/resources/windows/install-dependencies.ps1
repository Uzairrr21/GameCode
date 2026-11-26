param(
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot,
  [Parameter(Mandatory = $true)]
  [ValidateSet("x64", "arm64")]
  [string]$Architecture,
  [string]$UvExecutablePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$uvVersion = "0.12.13"
$pythonVersion = "3.12"
$graphifyVersion = "0.9.120"
$runtime = [System.IO.Path]::GetFullPath($InstallRoot)
$venv = Join-Path $runtime "venv"
$python = Join-Path $venv "Scripts\python.exe"
$pip = Join-Path $venv "Scripts\pip.exe"
$graphify = Join-Path $venv "Scripts\graphify.exe"
$manifest = "uv=$uvVersion`r`npython=$pythonVersion`r`ngraphifyy=$graphifyVersion`r`n"
$manifestPath = Join-Path $runtime "runtime.txt"

function Invoke-Uv {
  param([string[]]$Arguments)

  & $UvExecutablePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "uv $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

if ($UvExecutablePath -and -not (Test-Path -LiteralPath $UvExecutablePath -PathType Leaf)) {
  throw "The supplied uv executable was not found: $UvExecutablePath"
}

if (
  (Test-Path -LiteralPath $manifestPath -PathType Leaf) -and
  (Test-Path -LiteralPath $python -PathType Leaf) -and
  (Test-Path -LiteralPath $pip -PathType Leaf) -and
  (Test-Path -LiteralPath $graphify -PathType Leaf) -and
  ([System.IO.File]::ReadAllText($manifestPath) -eq $manifest)
) {
  Write-Output "GameCode Python and Graphifyy runtime is already installed."
  exit 0
}

$backup = "$runtime.previous-$([guid]::NewGuid().ToString('N'))"
$hadPrevious = Test-Path -LiteralPath $runtime
if ($hadPrevious) {
  Move-Item -LiteralPath $runtime -Destination $backup
}

try {
  New-Item -ItemType Directory -Path $runtime -Force | Out-Null
  $env:UV_PYTHON_INSTALL_DIR = Join-Path $runtime "python"
  $env:UV_CACHE_DIR = Join-Path $runtime ".cache"
  $env:UV_NO_CONFIG = "1"

  if (-not $UvExecutablePath) {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    $bootstrap = Join-Path $runtime ".bootstrap"
    New-Item -ItemType Directory -Path $bootstrap -Force | Out-Null

    $uvAsset = switch ($Architecture) {
      "x64" {
        @{
          Name = "uv-x86_64-pc-windows-msvc.zip"
          Sha256 = "a86c9dc7bad9b03f388583b7187c05fe9951c2e0d392217e8fd43d97787f6ec2"
        }
      }
      "arm64" {
        @{
          Name = "uv-aarch64-pc-windows-msvc.zip"
          Sha256 = "1efb2654b06e7063d4ac1fc9d49a9bda9a6704d82f035b589a2751a592f14151"
        }
      }
    }

    $url = "https://github.com/astral-sh/uv/releases/download/$uvVersion/$($uvAsset.Name)"
    $archive = Join-Path $bootstrap $uvAsset.Name
    Write-Output "Downloading verified uv $uvVersion for $Architecture..."
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing -TimeoutSec 120
    $actualSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $uvAsset.Sha256) {
      throw "The downloaded uv archive failed its SHA-256 check."
    }

    Expand-Archive -LiteralPath $archive -DestinationPath $bootstrap -Force
    $uvBinary = Get-ChildItem -LiteralPath $bootstrap -Filter "uv.exe" -File -Recurse | Select-Object -First 1
    if (-not $uvBinary) {
      throw "The verified uv archive did not contain uv.exe."
    }
    $UvExecutablePath = $uvBinary.FullName
  } else {
    $UvExecutablePath = (Resolve-Path -LiteralPath $UvExecutablePath).Path
  }

  Write-Output "Installing Python $pythonVersion and Graphifyy $graphifyVersion..."
  Invoke-Uv -Arguments @("python", "install", $pythonVersion)
  $managedPython = (& $UvExecutablePath python find --managed-python $pythonVersion | Select-Object -Last 1).ToString().Trim()
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $managedPython -PathType Leaf)) {
    throw "uv could not locate its managed Python $pythonVersion installation."
  }

  Invoke-Uv -Arguments @("venv", "--seed", "--python", $managedPython, $venv)
  Invoke-Uv -Arguments @("pip", "install", "--python", $python, "graphifyy==$graphifyVersion")

  foreach ($requiredFile in @($python, $pip, $graphify)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
      throw "The dependency installer did not create the required file: $requiredFile"
    }
  }

  [System.IO.File]::WriteAllText($manifestPath, $manifest, [System.Text.Encoding]::ASCII)
  $cache = Join-Path $runtime ".cache"
  $bootstrap = Join-Path $runtime ".bootstrap"
  if (Test-Path -LiteralPath $cache) {
    Remove-Item -LiteralPath $cache -Recurse -Force
  }
  if (Test-Path -LiteralPath $bootstrap) {
    Remove-Item -LiteralPath $bootstrap -Recurse -Force
  }
} catch {
  $failure = $_.Exception.Message
  if (Test-Path -LiteralPath $runtime) {
    Remove-Item -LiteralPath $runtime -Recurse -Force
  }
  if ($hadPrevious -and (Test-Path -LiteralPath $backup)) {
    Move-Item -LiteralPath $backup -Destination $runtime
  }
  throw "GameCode dependency installation failed and was rolled back: $failure"
}

if ($hadPrevious -and (Test-Path -LiteralPath $backup)) {
  Remove-Item -LiteralPath $backup -Recurse -Force
}

Write-Output "GameCode Python and Graphifyy runtime is ready."
