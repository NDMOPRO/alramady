$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$root = "C:\DATA_AI\rasid"
$rawFile = Join-Path $root "verification_run\raw_outputs\phase10_commands.txt"
$approvedFiles = @(
  "frontend/app/(dashboard)/home/page.tsx",
  "frontend/app/(dashboard)/data/page.tsx",
  "frontend/app/(dashboard)/analysis/page.tsx",
  "frontend/app/(dashboard)/reports/page.tsx",
  "frontend/app/(dashboard)/presentations/page.tsx",
  "frontend/app/(dashboard)/library/page.tsx",
  "frontend/app/(dashboard)/settings/page.tsx",
  "frontend/components/assistant/EmbeddedRasidAssistant.tsx",
  "frontend/lib/api/data.ts",
  "frontend/lib/api/dashboard.ts",
  "frontend/lib/api/reporting.ts",
  "frontend/lib/api/presentation.ts",
  "frontend/lib/api/library.ts",
  "frontend/lib/api/governance.ts"
)

Set-Content -Path $rawFile -Value ""

function Write-Section {
  param([string]$Text)
  Add-Content -Path $rawFile -Value $Text
}

function Run-And-Log {
  param([string]$Command)
  Write-Section "`$ $Command"
  $output = Invoke-Expression $Command 2>&1 | Out-String
  if ($output.Length -gt 0) {
    Write-Section $output.TrimEnd()
  }
  Write-Section ""
}

Run-And-Log "Set-Location '$root'; cmd /c ""docker compose up -d postgres redis elasticsearch minio gateway data-service dashboard-service reporting-service presentation-service governance-service library-service ai-service conversion-service localization-service frontend 2>&1"""
Run-And-Log "Set-Location '$root'; cmd /c ""docker compose ps 2>&1"""
Run-And-Log "Invoke-WebRequest -UseBasicParsing http://localhost/home | Select-Object StatusCode"
Run-And-Log "Invoke-WebRequest -UseBasicParsing http://localhost/data | Select-Object StatusCode"
Run-And-Log "Invoke-WebRequest -UseBasicParsing http://localhost/analysis | Select-Object StatusCode"
Run-And-Log "Invoke-WebRequest -UseBasicParsing http://localhost/reports | Select-Object StatusCode"
Run-And-Log "Invoke-WebRequest -UseBasicParsing http://localhost/presentations | Select-Object StatusCode"
Run-And-Log "Invoke-WebRequest -UseBasicParsing http://localhost/library | Select-Object StatusCode"
Run-And-Log "Invoke-WebRequest -UseBasicParsing http://localhost/settings | Select-Object StatusCode"
Run-And-Log "Set-Location '$root'; node verification_run\commands\phase9_validate.js"
Run-And-Log "Set-Location '$root'; npm run type-check --prefix frontend"

Write-Section '$ anti-fake scan on approved runtime files'
$patterns = @(
  "localStorage",
  "replication-session-store",
  "replication-generated-output-store",
  "Math.random",
  "mock",
  "placeholder",
  "demo"
)
foreach ($pattern in $patterns) {
  Write-Section "PATTERN: $pattern"
  $hits = Select-String -Path $approvedFiles -Pattern $pattern -SimpleMatch
  if ($hits) {
    foreach ($hit in $hits) {
      Write-Section ("{0}:{1}:{2}" -f $hit.Path, $hit.LineNumber, $hit.Line.Trim())
    }
  } else {
    Write-Section "NO_MATCH"
  }
}
Write-Section ""
