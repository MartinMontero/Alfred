# SPDX-License-Identifier: AGPL-3.0-or-later
# SPDX-FileCopyrightText: 2026 Martin Montero and the Alfred contributors
<#
.SYNOPSIS
  Alfred definition-of-done gate. Runs every proof line from RECIPE.md, prints
  PASS/FAIL per subsystem, ends with "X/Y subsystems PASS", and exits 0 only if
  all subsystems pass.

.DESCRIPTION
  Pure Windows PowerShell: no bash, no POSIX, no && chaining. Where a proof maps
  to an existing script (typecheck, vitest subsets, check:guard-boundary,
  check:tauri-align, cargo test) the gate CALLS it; it never re-implements it.

  -SelfTest proves the gate can FAIL (anti-false-green): it plants a drifted
  proof (corrupts the identifier in src-tauri/tauri.conf.json inside a
  backup-guarded try/finally), watches the gate print FAIL and exit nonzero,
  restores the file, re-runs clean, and prints both runs as evidence. SelfTest
  itself exits 0 only if the planted run FAILed as expected AND the clean run
  passed.

  Run:  powershell -ExecutionPolicy Bypass -File gate.ps1 [-SelfTest]
#>
[CmdletBinding()]
param(
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

# --- helpers ----------------------------------------------------------------

function Resolve-Exe {
  param([string]$Name)
  # Prefer a real executable/script host over a .ps1 shim (Process cannot run .ps1).
  $cmds = @(Get-Command $Name -All -ErrorAction SilentlyContinue)
  foreach ($c in $cmds) { if ($c.Source -match '\.(exe|cmd|bat)$') { return $c.Source } }
  if ($cmds.Count -gt 0) { return $cmds[0].Source }
  return $Name
}

function Invoke-External {
  param([string]$Exe, [string[]]$Arguments)
  # System.Diagnostics.Process with separate stdout/stderr capture: a native
  # command writing to stderr must NOT become a PowerShell error record (with
  # $ErrorActionPreference=Stop, merging 2>&1 would throw on the first line).
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = Resolve-Exe $Exe
  $psi.Arguments = ($Arguments -join ' ')
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $stdout = $p.StandardOutput.ReadToEndAsync()
  $stderr = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  $out = ($stdout.Result + "`n" + $stderr.Result)
  return [pscustomobject]@{ Output = $out; Code = $p.ExitCode }
}

function Test-UsesPinned {
  param([string[]]$Lines)
  $unpinned = @()
  $total = 0
  foreach ($l in $Lines) {
    if ($l -match 'uses:\s*([^\s#]+)') {
      $total++
      if ($Matches[1] -notmatch '@[0-9a-f]{40}$') { $unpinned += $Matches[1] }
    }
  }
  return [pscustomobject]@{ Total = $total; Unpinned = $unpinned }
}

function Get-CiJobs {
  param([string[]]$Lines)
  $inJobs = $false
  $jobs = @()
  foreach ($l in $Lines) {
    if ($l -match '^jobs:\s*$') { $inJobs = $true; continue }
    if ($inJobs -and $l -match '^\S') { break }
    if ($inJobs -and $l -match '^  ([a-z][a-z0-9-]*):\s*$') { $jobs += $Matches[1] }
  }
  return $jobs
}

function Result([bool]$Pass, [string]$Detail) {
  return [pscustomobject]@{ Pass = $Pass; Detail = $Detail }
}

function Clear-Ansi([string]$Text) {
  return [regex]::Replace($Text, "\x1b\[[0-9;]*m", '')
}

# --- one check per RECIPE.md row, in dependency order -----------------------

$Checks = @(
  @{
    Name = 'Tauri 2 shell'
    Body = {
      $conf = Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
      $cap = Get-Content 'src-tauri/capabilities/default.json' -Raw | ConvertFrom-Json
      $missing = @()
      if ($conf.identifier -ne 'dev.wecanjustbuildthings.alfred') { $missing += "identifier is '$($conf.identifier)'" }
      if (-not ($conf.bundle.externalBin -contains 'binaries/goose')) { $missing += 'bundle.externalBin lacks binaries/goose' }
      if (-not ($cap.permissions -contains 'updater:default')) { $missing += 'capabilities/default.json lacks updater:default' }
      if ($missing.Count -gt 0) { return (Result $false ($missing -join '; ')) }
      return (Result $true 'identifier dev.wecanjustbuildthings.alfred; externalBin binaries/goose; capabilities updater:default')
    }
  },
  @{
    Name = 'Frontend layer'
    Body = {
      $t = Invoke-External 'npm' @('run', 'typecheck')
      if ($t.Code -ne 0) { return (Result $false "npm run typecheck exited $($t.Code)") }
      $v = Invoke-External 'npx' @('vitest', 'run', 'src')
      if ($v.Code -ne 0) {
        $tail = (($v.Output -split "`n") | Where-Object { $_.Trim() -ne '' } | Select-Object -Last 3) -join ' | '
        return (Result $false "npx vitest run src exited $($v.Code): $tail")
      }
      $summary = Clear-Ansi ((($v.Output -split "`n") | Where-Object { $_ -match 'Test Files' } | Select-Object -First 1).Trim())
      return (Result $true "typecheck exit 0; vitest src exit 0 ($summary)")
    }
  },
  @{
    Name = 'Memory/vault layer'
    Body = {
      $t = Invoke-External 'npm' @('run', 'typecheck:mcp')
      if ($t.Code -ne 0) { return (Result $false "npm run typecheck:mcp exited $($t.Code)") }
      $v = Invoke-External 'npx' @('vitest', 'run', 'mcp')
      if ($v.Code -ne 0) { return (Result $false "npx vitest run mcp exited $($v.Code)") }
      $summary = Clear-Ansi ((($v.Output -split "`n") | Where-Object { $_ -match 'Test Files' } | Select-Object -First 1).Trim())
      return (Result $true "typecheck:mcp exit 0; vitest mcp exit 0 ($summary)")
    }
  },
  @{
    Name = 'goose/ACP sidecar'
    Body = {
      $stage = Get-Content 'scripts/stage-goose-sidecar.mjs' -Raw
      $rel = Get-Content '.github/workflows/release.yml' -Raw
      if ($stage -notmatch "EXPECTED_GOOSE_VERSION = '1\.43\.0'") { return (Result $false "stage-goose-sidecar.mjs does not pin EXPECTED_GOOSE_VERSION = '1.43.0'") }
      if ($rel -notmatch "GOOSE_VERSION:\s*'1\.43\.0'") { return (Result $false "release.yml does not pin GOOSE_VERSION: '1.43.0'") }
      $v = Invoke-External 'npx' @('vitest', 'run', 'src/lib/goose')
      if ($v.Code -ne 0) { return (Result $false "npx vitest run src/lib/goose exited $($v.Code)") }
      # Non-blocking honesty line: the staged binary is local state, not a repo
      # fact. A skew here is the documented open Windows re-stage (CLAUDE.md
      # tooling table) - surfaced loudly, never silently, but it does not fail
      # the gate because the PINS above are the repo's claim.
      $bin = 'src-tauri/binaries/goose-x86_64-pc-windows-msvc.exe'
      if (Test-Path $bin) {
        $ver = (Invoke-External $bin @('--version')).Output
        if ($ver -notmatch '1\.43\.0') {
          Write-Host "  [WARN] staged goose binary reports a version other than the 1.43.0 pin: $($ver.Trim())"
          Write-Host '         (Known open item: Windows re-stage + live-goose re-verify against 1.43.0. Non-blocking.)'
        }
      }
      return (Result $true "both pins 1.43.0; vitest src/lib/goose exit 0")
    }
  },
  @{
    Name = 'Holmes embedding'
    Body = {
      $toml = Get-Content 'src-tauri/Cargo.toml' -Raw
      $pins = [regex]::Matches($toml, 'holmes-(guard|core)\s*=\s*\{\s*git\s*=\s*"https://github\.com/MartinMontero/Holmes\.git",\s*tag\s*=\s*"v1\.0\.0-rc\.1"\s*\}')
      if ($pins.Count -ne 2) { return (Result $false "Cargo.toml carries $($pins.Count) Holmes v1.0.0-rc.1 tag pins, expected 2") }
      $g = Invoke-External 'npm' @('run', 'check:guard-boundary')
      if ($g.Code -ne 0) { return (Result $false "npm run check:guard-boundary exited $($g.Code)") }
      if ($g.Output -notmatch 'Guard boundary clean') { return (Result $false 'check:guard-boundary exited 0 but stdout lacks "Guard boundary clean"') }
      $c = Invoke-External 'cargo' @('test', '--manifest-path', 'src-tauri/Cargo.toml')
      if ($c.Code -ne 0) {
        $tail = (($c.Output -split "`n") | Where-Object { $_.Trim() -ne '' } | Select-Object -Last 3) -join ' | '
        return (Result $false "cargo test exited $($c.Code): $tail")
      }
      $summary = Clear-Ansi ((($c.Output -split "`n") | Where-Object { $_ -match 'test result:' } | Sort-Object { if ($_ -match '(\d+) passed') { [int]$Matches[1] } else { 0 } } -Descending | Select-Object -First 1).Trim())
      return (Result $true "2 Holmes tag pins v1.0.0-rc.1; guard boundary clean; cargo test exit 0 ($summary)")
    }
  },
  @{
    Name = 'Updater'
    Body = {
      $conf = Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
      $ep = $conf.plugins.updater.endpoints[0]
      if (-not ($ep -match '/releases/latest/download/latest\.json$')) { return (Result $false "updater endpoint is '$ep'") }
      if ([string]::IsNullOrWhiteSpace($conf.plugins.updater.pubkey)) { return (Result $false 'plugins.updater.pubkey is empty') }
      $v = Invoke-External 'npx' @('vitest', 'run', 'src/lib/updater-feed.test.ts', 'src/lib/updater-messages.test.ts')
      if ($v.Code -ne 0) { return (Result $false "updater vitest exited $($v.Code)") }
      $rb = Get-Content 'docs/beta/rollback-checklist.md' -Raw
      if ($rb -notmatch 'refuses same-or-lower version numbers') { return (Result $false 'rollback-checklist.md lacks the forward-in-number comparator rule') }
      return (Result $true 'endpoint latest.json; pubkey set; updater-feed + updater-messages tests exit 0; rollback comparator rule present')
    }
  },
  @{
    Name = 'Tauri Rust/JS alignment guard'
    Body = {
      $a = Invoke-External 'npm' @('run', 'check:tauri-align')
      if ($a.Code -ne 0) { return (Result $false "npm run check:tauri-align exited $($a.Code)") }
      $m = [regex]::Match($a.Output, 'All (\d+) tauri Rust/JS pairs aligned')
      if (-not $m.Success) { return (Result $false 'check:tauri-align exited 0 but stdout lacks the aligned-pairs summary') }
      return (Result $true "check:tauri-align exit 0 - All $($m.Groups[1].Value) pairs aligned (major/minor)")
    }
  },
  @{
    Name = 'CI five-job gate'
    Body = {
      $lines = Get-Content '.github/workflows/ci.yml'
      $jobs = Get-CiJobs $lines
      $expected = @('artifact-guard', 'quality', 'rust', 'supply-chain', 'verify')
      $actual = @($jobs | Sort-Object)
      if (($actual -join ',') -ne ($expected -join ',')) { return (Result $false "ci.yml jobs are [$($actual -join ',')], expected [$($expected -join ',')]") }
      $pins = Test-UsesPinned $lines
      if ($pins.Unpinned.Count -gt 0) { return (Result $false "ci.yml has unpinned uses: $($pins.Unpinned -join ', ')") }
      return (Result $true "5 jobs (verify, rust, artifact-guard, supply-chain, quality); $($pins.Total)/$($pins.Total) uses: SHA-pinned")
    }
  },
  @{
    Name = 'Release lane'
    Body = {
      $rel = Get-Content '.github/workflows/release.yml'
      if (($rel -join "`n") -notmatch "GOOSE_VERSION:\s*'1\.43\.0'") { return (Result $false "release.yml does not pin GOOSE_VERSION: '1.43.0'") }
      if (-not ($rel | Select-String -Pattern 'updater-feed\.mjs\s+build' -Quiet)) { return (Result $false 'release.yml lacks updater-feed.mjs build (ADR-0009 feed authorship)') }
      if (-not ($rel | Select-String -Pattern 'updater-feed\.mjs\s+verify' -Quiet)) { return (Result $false 'release.yml lacks updater-feed.mjs verify (feed regression gate)') }
      $pins = Test-UsesPinned $rel
      if ($pins.Unpinned.Count -gt 0) { return (Result $false "release.yml has unpinned uses: $($pins.Unpinned -join ', ')") }
      return (Result $true "GOOSE_VERSION 1.43.0; updater-feed build + verify present; $($pins.Total)/$($pins.Total) uses: SHA-pinned")
    }
  },
  @{
    Name = 'Skills/Skillsmith integration'
    Body = {
      $v = Invoke-External 'npx' @('vitest', 'run', 'src/lib/skills')
      if ($v.Code -ne 0) { return (Result $false "npx vitest run src/lib/skills exited $($v.Code)") }
      $pkg = Get-Content 'package.json' -Raw
      if ($pkg -match '@skillsmith') { return (Result $false 'package.json contains @skillsmith - Skillsmith is external-npx-only (ADR-0003)') }
      return (Result $true 'vitest src/lib/skills exit 0 (scan canaries + registry); 0 @skillsmith entries in package.json')
    }
  }
)

# --- runner -----------------------------------------------------------------

function Invoke-Gate {
  $results = @()
  foreach ($check in $Checks) {
    $res = $null
    try {
      $res = & $check.Body
    } catch {
      $res = Result $false "exception: $($_.Exception.Message)"
    }
    $status = 'FAIL'
    if ($res.Pass) { $status = 'PASS' }
    Write-Host ("{0}  {1} - {2}" -f $status, $check.Name, $res.Detail)
    $results += [pscustomobject]@{ Name = $check.Name; Pass = [bool]$res.Pass }
  }
  $passed = @($results | Where-Object { $_.Pass }).Count
  Write-Host ''
  Write-Host ("{0}/{1} subsystems PASS" -f $passed, $results.Count)
  return [pscustomobject]@{ Results = $results; Passed = $passed; Total = $results.Count; AllPass = ($passed -eq $results.Count) }
}

# --- main -------------------------------------------------------------------

if (-not $SelfTest) {
  $r = Invoke-Gate
  if ($r.AllPass) { exit 0 } else { exit 1 }
}

# -SelfTest: plant a failing proof, watch FAIL fire, restore, show clean run.
Write-Host '=== gate.ps1 -SelfTest (anti-false-green): proving the gate can FAIL ==='
Write-Host ''

$target = 'src-tauri/tauri.conf.json'
$backup = Join-Path $env:TEMP ('tauri.conf.json.gate-selftest-' + [guid]::NewGuid().ToString('N') + '.bak')

$plantedAllPass = $true
$plantedSawShellFail = $false
try {
  Copy-Item $target $backup -Force
  $drifted = (Get-Content $target -Raw) -replace '"identifier": "dev\.wecanjustbuildthings\.alfred"', '"identifier": "dev.wecanjustbuildthings.alfred-DRIFT-SELFTEST"'
  # UTF-8 WITHOUT BOM: the file stays valid JSON so the planted drift fails ONLY
  # the Tauri 2 shell proof (a BOM would break the Tauri build script too and
  # muddy the evidence). The backup restore below is authoritative either way.
  [System.IO.File]::WriteAllText((Resolve-Path $target).Path, $drifted, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host '--- PLANTED RUN (identifier drifted in src-tauri/tauri.conf.json) ---'
  $planted = Invoke-Gate
  $plantedAllPass = $planted.AllPass
  $plantedSawShellFail = (@($planted.Results | Where-Object { $_.Name -eq 'Tauri 2 shell' -and -not $_.Pass }).Count -eq 1)
} finally {
  Copy-Item $backup $target -Force
  Remove-Item $backup -Force -ErrorAction SilentlyContinue
  Write-Host '--- RESTORED src-tauri/tauri.conf.json ---'
}
Write-Host ''

Write-Host '--- CLEAN RUN (after restore) ---'
$clean = Invoke-Gate
Write-Host ''

Write-Host '=== SELF-TEST EVIDENCE ==='
Write-Host ("Planted run:  AllPass={0} (expected False); 'Tauri 2 shell' FAIL fired={1} (expected True)" -f $plantedAllPass, $plantedSawShellFail)
Write-Host ("Clean run:    AllPass={0} (expected True)" -f $clean.AllPass)

if ((-not $plantedAllPass) -and $plantedSawShellFail -and $clean.AllPass) {
  Write-Host 'SELF-TEST PASS: the gate fires FAIL on a drifted proof and returns green only when the repo is clean.'
  exit 0
}
Write-Host 'SELF-TEST FAIL: the gate did not behave as required - do not trust a green from this gate until fixed.'
exit 1
