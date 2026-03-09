$log = 'verification_run/raw_outputs/phase4_commands.txt'
Set-Content -Path $log -Value ''

function Add-Section([string]$command, [string]$output) {
  Add-Content -Path $log -Value ">>> $command"
  Add-Content -Path $log -Value $output
  Add-Content -Path $log -Value ""
}

$docker = docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}" | Out-String
Add-Section 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"' $docker.TrimEnd()

$tsc = (npm run type-check --prefix frontend | Out-String)
Add-Section 'npm run type-check --prefix frontend' $tsc.TrimEnd()

$login = Invoke-RestMethod -Method Post -Uri 'http://localhost/api/v1/governance/auth/login' -ContentType 'application/json' -Body '{"email":"admin@rasid.demo","password":"Password123!"}'
$loginJson = $login | ConvertTo-Json -Depth 8
Add-Section 'Invoke-RestMethod POST http://localhost/api/v1/governance/auth/login' $loginJson
$token = $login.data.accessToken
$headers = @{ Authorization = "Bearer $token" }

$dataSources = Invoke-RestMethod -Headers $headers -Uri 'http://localhost/api/v1/data/sources?page=1&limit=3' | ConvertTo-Json -Depth 8
Add-Section 'Invoke-RestMethod GET http://localhost/api/v1/data/sources?page=1&limit=3' $dataSources

$importRaw = curl.exe -s -X POST -H "Authorization: Bearer $token" -F "file=@verification_run/raw_outputs/phase4-home-sample.csv" http://localhost/api/v1/data/import/single | Out-String
Add-Section 'curl.exe -s -X POST -H "Authorization: Bearer <token>" -F "file=@verification_run/raw_outputs/phase4-home-sample.csv" http://localhost/api/v1/data/import/single' $importRaw.TrimEnd()
$import = $importRaw | ConvertFrom-Json

$analysis = Invoke-RestMethod -Method Post -Headers $headers -Uri 'http://localhost/api/v1/dashboard/analyze-data' -ContentType 'application/json' -Body (@{ datasetId = $import.data.id } | ConvertTo-Json) | ConvertTo-Json -Depth 8
Add-Section 'Invoke-RestMethod POST http://localhost/api/v1/dashboard/analyze-data' $analysis

$markdownSample = [string](Get-Content 'verification_run/raw_outputs/phase4-home-sample.md' -Raw)
$detect = Invoke-RestMethod -Method Post -Headers $headers -Uri 'http://localhost/api/v1/localization/translate/detect' -ContentType 'application/json' -Body (@{ text = $markdownSample } | ConvertTo-Json) | ConvertTo-Json -Depth 8
Add-Section 'Invoke-RestMethod POST http://localhost/api/v1/localization/translate/detect' $detect

$translate = Invoke-RestMethod -Method Post -Headers $headers -Uri 'http://localhost/api/v1/localization/translate/text' -ContentType 'application/json' -Body (@{ text = $markdownSample; sourceLang = 'en'; targetLang = 'ar' } | ConvertTo-Json) | ConvertTo-Json -Depth 8
Add-Section 'Invoke-RestMethod POST http://localhost/api/v1/localization/translate/text' $translate

$reports = Invoke-RestMethod -Headers $headers -Uri 'http://localhost/api/v1/reporting/reports?page=1&limit=2' | ConvertTo-Json -Depth 8
Add-Section 'Invoke-RestMethod GET http://localhost/api/v1/reporting/reports?page=1&limit=2' $reports

$presentations = Invoke-RestMethod -Headers $headers -Uri 'http://localhost/api/v1/presentation/presentations?page=1&limit=2' | ConvertTo-Json -Depth 8
Add-Section 'Invoke-RestMethod GET http://localhost/api/v1/presentation/presentations?page=1&limit=2' $presentations

$dashboards = Invoke-RestMethod -Headers $headers -Uri 'http://localhost/api/v1/dashboard/dashboards?page=1&limit=2' | ConvertTo-Json -Depth 8
Add-Section 'Invoke-RestMethod GET http://localhost/api/v1/dashboard/dashboards?page=1&limit=2' $dashboards

Get-Item $log | Format-Table FullName,Length,LastWriteTime -AutoSize
