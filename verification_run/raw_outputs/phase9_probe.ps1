$ProgressPreference='SilentlyContinue'
$urls = @('http://localhost','http://localhost/home','http://localhost/data','http://localhost/analysis','http://localhost/reports','http://localhost/presentations','http://localhost/library','http://localhost/settings','http://localhost/api/v1/governance/health','http://localhost/api/v1/data/health','http://localhost/api/v1/reporting/health','http://localhost/api/v1/presentation/health','http://localhost/api/v1/library/health','http://localhost/api/v1/dashboard/health')
foreach ($u in $urls) {
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 15
    "{0}`t{1}`t{2}" -f $u, [int]$r.StatusCode, ($r.Content.Length)
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      "{0}`t{1}`tERROR" -f $u, [int]$resp.StatusCode
    } else {
      "{0}`tFAIL`t{1}" -f $u, $_.Exception.Message
    }
  }
}
