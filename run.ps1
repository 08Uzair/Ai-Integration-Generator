<#
.SYNOPSIS
    AI Integration Generator - run the wizard locally (no backend, no database).

.SERVICES
    Wizard UI    : http://localhost:3000   (Next.js app with the bundled engine)
    Terminal CLI : cli/                    (fully standalone)

.USAGE
    .\run.ps1
    .\run.ps1 -Install
    .\run.ps1 -Dev
    .\run.ps1 -Stop
    .\run.ps1 -Cli          (launch the terminal wizard)
    .\run.ps1 -Cli -Install (install everything, then launch the terminal wizard)

    Ctrl+C also stops all services.
#>

param(
    [switch]$Install,
    [switch]$Dev,
    [switch]$Stop,
    [switch]$Cli
)

$ErrorActionPreference = "Continue"

$Root = $PSScriptRoot

# ============================================================
# FUNCTION: STOP AIG PROCESSES
# ============================================================

function Stop-AIG {

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Yellow
    Write-Host "        STOPPING AIG SERVICES" -ForegroundColor Yellow
    Write-Host "==================================================" -ForegroundColor Yellow
    Write-Host ""

    $found = $false

    # --------------------------------------------------------
    # 1. STOP THE WIZARD BY PORT (3000)
    # --------------------------------------------------------

    $ports = @(3000)

    foreach ($port in $ports) {

        $connections = Get-NetTCPConnection `
            -LocalPort $port `
            -State Listen `
            -ErrorAction SilentlyContinue

        foreach ($connection in $connections) {

            $found = $true

            # IMPORTANT:
            # Do NOT use $pid here because PowerShell already
            # has the automatic $PID variable.

            $processId = $connection.OwningProcess

            $process = Get-Process `
                -Id $processId `
                -ErrorAction SilentlyContinue

            if ($process) {

                Write-Host `
                    "[PORT $port] Stopping $($process.ProcessName) (PID $processId)" `
                    -ForegroundColor Yellow

                try {

                    taskkill `
                        /PID $processId `
                        /T `
                        /F | Out-Null

                    Write-Host `
                        "[PORT $port] Stopped." `
                        -ForegroundColor Green

                }
                catch {

                    Write-Host `
                        "[PORT $port] Failed to stop PID $processId" `
                        -ForegroundColor Red
                }
            }
        }
    }

    # --------------------------------------------------------
    # 2. FIND AIG NODE PROCESSES
    #
    # Catches node processes whose command line references this
    # project (e.g. a Next.js dev server started manually).
    # --------------------------------------------------------

    Write-Host ""
    Write-Host "Checking project Node processes..." -ForegroundColor Cyan

    $nodeProcesses = Get-CimInstance Win32_Process `
        -Filter "Name = 'node.exe'" `
        -ErrorAction SilentlyContinue

    foreach ($nodeProcess in $nodeProcesses) {

        $commandLine = $nodeProcess.CommandLine

        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            continue
        }

        # Normalize paths so matching works consistently.
        $normalizedCommand = $commandLine.ToLower()
        $normalizedRoot = $Root.ToLower()

        if ($normalizedCommand.Contains($normalizedRoot)) {

            $found = $true

            $processId = $nodeProcess.ProcessId

            Write-Host `
                "[NODE] Stopping PID $processId" `
                -ForegroundColor Yellow

            Write-Host `
                "       $commandLine" `
                -ForegroundColor DarkGray

            try {

                taskkill `
                    /PID $processId `
                    /T `
                    /F | Out-Null

                Write-Host `
                    "[NODE] Stopped PID $processId" `
                    -ForegroundColor Green

            }
            catch {

                Write-Host `
                    "[NODE] Could not stop PID $processId" `
                    -ForegroundColor Red
            }
        }
    }

    # --------------------------------------------------------
    # 3. FIND NPM / CMD PROCESSES BELONGING TO THIS PROJECT
    # --------------------------------------------------------

    $otherProcesses = Get-CimInstance Win32_Process `
        -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -in @("npm.cmd", "cmd.exe", "node.exe") -and
            $_.CommandLine -and
            $_.CommandLine.ToLower().Contains($Root.ToLower())
        }

    foreach ($process in $otherProcesses) {

        $found = $true

        $processId = $process.ProcessId

        Write-Host `
            "[CLIENT PROCESS] Stopping PID $processId" `
            -ForegroundColor Yellow

        try {

            taskkill `
                /PID $processId `
                /T `
                /F | Out-Null

            Write-Host `
                "[CLIENT PROCESS] Stopped." `
                -ForegroundColor Green

        }
        catch {
        }
    }

    # --------------------------------------------------------
    # RESULT
    # --------------------------------------------------------

    Write-Host ""

    if ($found) {

        Write-Host `
            "All services stopped successfully." `
            -ForegroundColor Green

    }
    else {

        Write-Host `
            "No running services were found." `
            -ForegroundColor Green
    }

    Write-Host ""
}

# ============================================================
# STOP MODE
# ============================================================

if ($Stop) {

    Stop-AIG

    exit 0
}

# ============================================================
# NODE
# ============================================================

$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "       AI INTEGRATION GENERATOR - STARTUP" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Root: $Root" -ForegroundColor DarkGray
Write-Host "Node: $nodeExe" -ForegroundColor DarkGray

# ============================================================
# INSTALL
# ============================================================

if ($Install) {

    Write-Host ""
    Write-Host "Installing dependencies (npm workspaces)..." -ForegroundColor Cyan
    Write-Host ""

    Push-Location $Root

    try {

        npm install

        if ($LASTEXITCODE -ne 0) {

            Write-Host ""
            Write-Host "npm install failed." -ForegroundColor Red
            exit 1
        }

    }
    finally {

        Pop-Location
    }

    Write-Host ""
    Write-Host "All dependencies installed successfully." -ForegroundColor Green
}

# ============================================================
# CHECK NODE_MODULES
#
# This repo uses npm workspaces, so dependencies are hoisted
# into the root node_modules folder.
# ============================================================

$rootModules = Join-Path $Root "node_modules"

if (-not (Test-Path $rootModules)) {

    Write-Host ""
    Write-Host "node_modules not found." -ForegroundColor Red
    Write-Host "Run: .\run.ps1 -Install" -ForegroundColor Yellow

    exit 1
}

# ============================================================
# CLI MODE (terminal wizard)
#
# The CLI is fully standalone - it runs the bundled engine
# in-process and needs no backend or database.
# ============================================================

if ($Cli) {

    Write-Host ""
    Write-Host "Launching the terminal wizard (all 8 steps run here)..." -ForegroundColor Green
    Write-Host "--------------------------------------------------" -ForegroundColor DarkGray

    Push-Location (Join-Path $Root "cli")

    try {

        node src/index.js

    }
    finally {

        Pop-Location
    }

    exit 0
}

# ============================================================
# START CLIENT (wizard)
#
# The wizard runs standalone: the generation engine is bundled
# into the Next.js app, so no backend API or MongoDB is needed.
# ============================================================

$servicePath = Join-Path $Root "frontend"

Write-Host ""
Write-Host "[CLIENT] Starting..." -ForegroundColor Green

$clientJob = Start-Job `
    -Name "AIG-CLIENT" `
    -ScriptBlock {

        param($ServicePath)

        Set-Location $ServicePath

        npm run dev

    } `
    -ArgumentList $servicePath

$jobs = @($clientJob)

# ============================================================
# STARTUP COMPLETE
# ============================================================

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "         ALL SERVICES STARTED" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""

Write-Host "[CLIENT]  http://localhost:3000" -ForegroundColor Cyan

Write-Host ""

if ($Dev) {

    Write-Host `
        "Development mode: ON" `
        -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Live service output:" -ForegroundColor White
Write-Host "--------------------------------------------------" -ForegroundColor DarkGray

# ============================================================
# OUTPUT FUNCTION
# ============================================================

function Write-ServiceOutput {

    param(
        [string]$Name,
        [string]$Text
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return
    }

    $timestamp = Get-Date -Format "HH:mm:ss"

    Write-Host `
        "[$timestamp][$Name] $Text"
}

# ============================================================
# MONITOR
# ============================================================

try {

    while ($true) {

        foreach ($job in $jobs) {

            $output = Receive-Job `
                -Job $job `
                -ErrorAction SilentlyContinue

            foreach ($line in $output) {

                Write-ServiceOutput `
                    -Name $job.Name.Replace("AIG-", "") `
                    -Text "$line"
            }

            if ($job.State -eq "Failed") {

                Write-Host ""

                Write-Host `
                    "[$($job.Name)] PROCESS FAILED" `
                    -ForegroundColor Red

                $reason = $job.ChildJobs[0].JobStateInfo.Reason

                if ($reason) {

                    Write-Host `
                        $reason `
                        -ForegroundColor Red
                }
            }
        }

        Start-Sleep -Milliseconds 200
    }

}
finally {

    Write-Host ""
    Write-Host "Stopping services..." -ForegroundColor Yellow
    Write-Host ""

    # Stop PowerShell jobs
    foreach ($job in $jobs) {

        try {

            Write-Host `
                "Stopping $($job.Name)..." `
                -ForegroundColor Yellow

            Stop-Job `
                -Job $job `
                -ErrorAction SilentlyContinue

            Remove-Job `
                -Job $job `
                -Force `
                -ErrorAction SilentlyContinue

        }
        catch {
        }
    }

    # Stop any remaining project Node processes and
    # services on the known ports.

    Stop-AIG
}
