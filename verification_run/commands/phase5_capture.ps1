$ErrorActionPreference = 'Stop'

$root = 'C:\DATA_AI\rasid'
$outputFile = Join-Path $root 'verification_run\raw_outputs\phase5_commands.txt'

if (Test-Path $outputFile) {
  Remove-Item $outputFile -Force
}

function Write-Block {
  param(
    [string]$Command,
    [string]$Output
  )

  Add-Content -Path $outputFile -Value ('$ ' + $Command)
  if ($Output) {
    Add-Content -Path $outputFile -Value $Output
  }
  Add-Content -Path $outputFile -Value ''
}

function Run-Cmd {
  param(
    [string]$Command,
    [string]$Workdir = $root
  )

  $raw = & cmd /c "cd /d $Workdir && $Command 2>&1" | Out-String
  Write-Block -Command $Command -Output $raw.TrimEnd()
}

Run-Cmd -Command 'npm run type-check --prefix frontend'
Run-Cmd -Command 'npm test --prefix services/data-service -- reading.service.test.ts mixed-files.service.test.ts --runInBand'
Run-Cmd -Command 'npm test --prefix services/dashboard-service -- auto-dashboard.controller.test.ts auto-dashboard-generator.service.test.ts --runInBand'
Run-Cmd -Command 'npm test --prefix services/reporting-service -- report-builder.service.test.ts scheduled-reports.service.test.ts --runInBand'
Run-Cmd -Command 'npm test --prefix services/presentation-service -- source-processor.test.ts ai-slide-generator.test.ts --runInBand'
Run-Cmd -Command 'npm test --prefix services/library-service'
Run-Cmd -Command 'npx jest --config jest.config.ts --runInBand src/__tests__/audit.service.test.ts src/__tests__/authentication.test.ts' -Workdir (Join-Path $root 'services\governance-service')

$login = Invoke-RestMethod -Method Post -Uri 'http://localhost/api/v1/governance/auth/login' -ContentType 'application/json' -Body '{"email":"admin@rasid.demo","password":"Password123!"}'
$token = $login.data.accessToken
$tenantId = $login.data.user.tenantId
$headers = @{
  Authorization = "Bearer $token"
  'X-Tenant-ID' = $tenantId
}

$dataList = Invoke-RestMethod -Headers $headers -Uri 'http://localhost/api/v1/data/sources?page=1&limit=8'
$dataset = $dataList.data | Where-Object { $_.name -eq 'analysis-surface-20260309-094817' } | Select-Object -First 1
if (-not $dataset) {
  $dataset = $dataList.data | Select-Object -First 1
}
$dataDetail = Invoke-RestMethod -Headers $headers -Uri ("http://localhost/api/v1/data/sources/{0}" -f $dataset.id)
$dataRows = Invoke-RestMethod -Headers $headers -Uri ("http://localhost/api/v1/data/sources/{0}/rows?page=1&limit=20" -f $dataset.id)
$dataStats = Invoke-RestMethod -Headers $headers -Uri ("http://localhost/api/v1/data/sources/{0}/statistics" -f $dataset.id)
$analysis = Invoke-RestMethod -Method Post -Headers $headers -Uri 'http://localhost/api/v1/dashboard/analyze-data' -ContentType 'application/json' -Body (@{
  datasetId = $dataset.id
  preferredChartTypes = @('line_chart', 'bar_chart', 'pie_chart')
} | ConvertTo-Json)

$reportList = Invoke-RestMethod -Headers $headers -Uri 'http://localhost/api/v1/reporting/reports?page=1&limit=12'
$report = $reportList.data | Where-Object { $_.status -eq 'BUILT' } | Select-Object -First 1
if (-not $report) {
  $report = $reportList.data | Select-Object -First 1
}
$reportBuild = Invoke-RestMethod -Method Post -Headers $headers -Uri ("http://localhost/api/v1/reporting/reports/{0}/build" -f $report.id)
$reportHtml = Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri ("http://localhost/api/v1/reporting/reports/{0}/export/html" -f $report.id)

$presentationList = Invoke-RestMethod -Headers $headers -Uri 'http://localhost/api/v1/presentation/presentations?page=1&limit=20'
$presentation = $presentationList.data | Where-Object { $_.name -like 'Board Update*' -or $_.title -like 'Board Update*' } | Select-Object -First 1
if (-not $presentation) {
  $presentation = $presentationList.data | Select-Object -First 1
}
$presentationDetail = Invoke-RestMethod -Headers $headers -Uri ("http://localhost/api/v1/presentation/presentations/{0}" -f $presentation.id)
$presentationPptx = Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri ("http://localhost/api/v1/presentation/presentations/{0}/export/pptx" -f $presentation.id)

$libraryList = Invoke-RestMethod -Headers $headers -Uri 'http://localhost/api/v1/library/assets?page=1&limit=20'
$libraryItem = $libraryList.data | Select-Object -First 1
$libraryDetail = $null
if ($libraryItem) {
  $libraryDetail = Invoke-RestMethod -Headers $headers -Uri ("http://localhost/api/v1/library/assets/{0}" -f $libraryItem.id)
}

$users = Invoke-RestMethod -Headers $headers -Uri 'http://localhost/api/v1/governance/users?page=1&limit=8'
$audit = Invoke-RestMethod -Headers $headers -Uri 'http://localhost/api/v1/governance/audit?page=1&limit=8'
$auditExport = Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri 'http://localhost/api/v1/governance/audit/export?format=csv&action=user.login'
$settingsHeadersFile = Join-Path $root 'verification_run\raw_outputs\phase5_settings_headers.txt'
$settingsBodyFile = Join-Path $root 'verification_run\raw_outputs\phase5_settings_body.txt'
if (Test-Path $settingsHeadersFile) { Remove-Item $settingsHeadersFile -Force }
if (Test-Path $settingsBodyFile) { Remove-Item $settingsBodyFile -Force }
& curl.exe -s -D $settingsHeadersFile -o $settingsBodyFile -H ("Authorization: Bearer {0}" -f $token) -H ("X-Tenant-ID: {0}" -f $tenantId) 'http://localhost/api/v1/governance/settings' | Out-Null
$settingsStatusLine = Get-Content -Path $settingsHeadersFile | Select-Object -First 1
$settingsBody = if (Test-Path $settingsBodyFile) { Get-Content -Path $settingsBodyFile -Raw } else { '' }
$settingsProbe = [ordered]@{
  status = $settingsStatusLine
  body = $settingsBody
}

$apiSummary = [ordered]@{
  loginUser = $login.data.user.email
  datasetsTotal = $dataList.pagination.total
  datasetId = $dataset.id
  datasetName = $dataDetail.data.name
  datasetRowsReturned = @($dataRows.data).Count
  datasetRowsFirst = $dataRows.data | Select-Object -First 1
  datasetTotalRows = $dataStats.data.totalRows
  analysisChartCount = @($analysis.data.analysis.chartRecommendations).Count
  analysisKpiCount = @($analysis.data.analysis.kpiRecommendations).Count
  analysisTopChart = $analysis.data.analysis.chartRecommendations | Select-Object -First 1
  reportsTotal = $reportList.pagination.total
  reportId = $report.id
  reportName = $report.name
  reportBuildStatus = $reportBuild.data.status
  reportHtmlBytes = $reportHtml.Content.Length
  presentationsTotal = $presentationList.pagination.total
  presentationId = $presentation.id
  presentationName = if ($presentationDetail.data.title) { $presentationDetail.data.title } else { $presentationDetail.data.name }
  presentationSlides = @($presentationDetail.data.slides).Count
  presentationPptxBytes = $presentationPptx.Content.Length
  libraryTotal = $libraryList.pagination.totalCount
  libraryFirst = if ($libraryDetail) { $libraryDetail.data.name } else { $null }
  usersTotal = $users.pagination.total
  auditTotal = $audit.pagination.total
  auditExportBytes = $auditExport.Content.Length
  settingsProbe = $settingsProbe
}

Write-Block -Command 'live_api_verification' -Output ($apiSummary | ConvertTo-Json -Depth 8)
