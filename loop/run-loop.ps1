<#
run-loop.ps1 — внешний цикл имплементации с тормозами СНАРУЖИ модели.

Тормоза (см. GOAL.md):
  - потолок итераций (-MaxIterations, default 25)
  - потолок стоимости в $ (-MaxCostUsd, default 15), суммируется по total_cost_usd из JSON-вывода
  - детект отсутствия прогресса: -MaxNoProgress итераций подряд без нового [x] и без нового коммита
  - 2 подряд FAIL от независимого верификатора -> стоп

Использование (из корня проекта):
  powershell -File loop\run-loop.ps1                 # осторожный режим (permission-mode acceptEdits)
  powershell -File loop\run-loop.ps1 -Autonomous     # полный автоном (--dangerously-skip-permissions) —
                                                     # только после успешного ручного прогона, см. README
#>

param(
    [int]$MaxIterations = 25,
    [double]$MaxCostUsd = 15.0,
    [int]$MaxNoProgress = 3,
    [int]$MaxTurnsPerIteration = 80,
    [string]$WorkerModel = "",        # пусто = модель по умолчанию
    [string]$VerifierModel = "sonnet",# верификатор — ДРУГАЯ модель, не автор
    [switch]$Autonomous
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot   # корень проекта (loop/ лежит в нём)
Set-Location $root

$logFile = Join-Path $PSScriptRoot "run.log"
function Log([string]$msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding utf8
}

function Get-RemainingCount {
    $m = Select-String -Path (Join-Path $root "TASKS.md") -Pattern '^\s*-\s\[\s\]' -AllMatches
    if ($null -eq $m) { return 0 }
    return ($m | Measure-Object).Count
}
function Get-DoneCount {
    $m = Select-String -Path (Join-Path $root "TASKS.md") -Pattern '^\s*-\s\[x\]' -AllMatches
    if ($null -eq $m) { return 0 }
    return ($m | Measure-Object).Count
}
function Get-GitHead {
    try { return (git rev-parse HEAD 2>$null) } catch { return "" }
}

function Invoke-Claude([string]$promptFile, [string]$model, [bool]$writeAccess) {
    $cliArgs = @("-p", "--output-format", "json", "--max-turns", $MaxTurnsPerIteration)
    if ($model -ne "") { $cliArgs += @("--model", $model) }
    if ($writeAccess) {
        if ($Autonomous) { $cliArgs += "--dangerously-skip-permissions" }
        else             { $cliArgs += @("--permission-mode", "acceptEdits") }
    } else {
        $cliArgs += @("--permission-mode", "default")
    }
    $out = Get-Content -Raw $promptFile | & claude @cliArgs
    return ($out | ConvertFrom-Json)
}

# --- предохранители окружения ---
if (-not (Test-Path (Join-Path $root "TASKS.md"))) { throw "TASKS.md не найден — запускать из корня проекта" }
if ((Get-GitHead) -eq "") { throw "Не git-репозиторий. Сначала ручной шаг 0 из loop/README.md (git init + первый коммит)" }

$totalCost = 0.0
$noProgressStreak = 0
$verifierFailStreak = 0

Log "=== LOOP START: maxIter=$MaxIterations maxCost=`$$MaxCostUsd autonomous=$Autonomous ==="

for ($i = 1; $i -le $MaxIterations; $i++) {

    $remaining = Get-RemainingCount
    if ($remaining -eq 0) { Log "ALL TASKS DONE — план выполнен."; exit 0 }

    $doneBefore = Get-DoneCount
    $headBefore = Get-GitHead
    Log "--- iter $i/$MaxIterations · remaining=$remaining · spent=`$$([math]::Round($totalCost,2)) ---"

    # 1) рабочая итерация
    try {
        $res = Invoke-Claude (Join-Path $PSScriptRoot "ITERATION_PROMPT.md") $WorkerModel $true
    } catch {
        Log "worker call FAILED: $($_.Exception.Message)"; $noProgressStreak++
        if ($noProgressStreak -ge $MaxNoProgress) { Log "STOP: no progress ($noProgressStreak)"; exit 2 }
        continue
    }
    $cost = 0.0
    if ($null -ne $res.total_cost_usd) { $cost = [double]$res.total_cost_usd }
    $totalCost += $cost
    Log "worker done · cost=`$$([math]::Round($cost,2))"
    if ($totalCost -ge $MaxCostUsd) { Log "STOP: cost cap `$$MaxCostUsd reached (`$$([math]::Round($totalCost,2)))"; exit 3 }

    # 2) независимый верификатор (другая модель, read+run, без записи)
    $verdict = "VERDICT: FAIL — verifier call error"
    try {
        $v = Invoke-Claude (Join-Path $PSScriptRoot "VERIFY_PROMPT.md") $VerifierModel $false
        if ($null -ne $v.total_cost_usd) { $totalCost += [double]$v.total_cost_usd }
        if ($null -ne $v.result) { $verdict = ($v.result -split "`n" | Where-Object { $_ -match '^VERDICT:' } | Select-Object -Last 1) }
        if ($null -eq $verdict) { $verdict = "VERDICT: FAIL — no verdict line in verifier output" }
    } catch {
        Log "verifier call FAILED: $($_.Exception.Message)"
    }
    Log "verifier: $verdict"

    if ($verdict -notmatch '^VERDICT:\s*PASS') {
        $verifierFailStreak++
        if ($verifierFailStreak -ge 2) { Log "STOP: verifier failed twice in a row — нужен человек. См. loop/STATE.md и run.log"; exit 4 }
    } else {
        $verifierFailStreak = 0
    }

    # 3) детект прогресса (снаружи модели): новый [x] ИЛИ новый коммит
    $doneAfter = Get-DoneCount
    $headAfter = Get-GitHead
    if (($doneAfter -gt $doneBefore) -or ($headAfter -ne $headBefore)) {
        $noProgressStreak = 0
    } else {
        $noProgressStreak++
        Log "no progress this iteration (streak=$noProgressStreak)"
        if ($noProgressStreak -ge $MaxNoProgress) { Log "STOP: no progress for $MaxNoProgress iterations"; exit 2 }
    }
}

Log "STOP: iteration cap $MaxIterations reached · spent=`$$([math]::Round($totalCost,2))"
exit 1
