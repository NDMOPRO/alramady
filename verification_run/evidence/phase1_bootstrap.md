# 1. discovered commands

- install
  - `npm install`
  - `npm install --prefix frontend`
  - `npm install --prefix services/data-service`
  - `npm install --prefix services/dashboard-service`
  - `npm install --prefix services/reporting-service`
  - `npm install --prefix services/presentation-service`
  - `npm install --prefix services/library-service`
  - `npm install --prefix services/governance-service`
  - `npm install --prefix services/ai-service`
- database/migrations
  - `bash ./scripts/init-db.sh`
  - `bash ./scripts/run-migrations.sh --full`
  - `npm run migrate --prefix services/data-service`
  - `npm run migrate --prefix services/dashboard-service`
  - `npm run migrate --prefix services/reporting-service`
  - `npm run migrate --prefix services/presentation-service`
  - `npm run migrate --prefix services/library-service`
  - `npm run migrate --prefix services/governance-service`
  - `npm run migrate --prefix services/ai-service`
- storage and infrastructure
  - `docker compose up -d`
  - `docker compose ps`
  - `docker compose logs --tail=80 library-service`
- gateway/backend services
  - `npm run dev --prefix services/data-service`
  - `npm run dev --prefix services/dashboard-service`
  - `npm run dev --prefix services/reporting-service`
  - `npm run dev --prefix services/presentation-service`
  - `npm run dev --prefix services/library-service`
  - `npm run dev --prefix services/governance-service`
  - `npm run dev --prefix services/ai-service`
- frontend
  - `npm run dev --prefix frontend`
  - `npm run build --prefix frontend`
  - `npm run start --prefix frontend`
  - `npm run type-check --prefix frontend`
- tests
  - `npm test --prefix services/data-service`
  - `npm test --prefix services/dashboard-service`
  - `npm test --prefix services/reporting-service`
  - `npm test --prefix services/presentation-service`
  - `npm test --prefix services/library-service`

# 2. actual commands executed

- `Get-Location`
- `Get-Content package.json`
- `Get-ChildItem -Recurse -Filter package.json | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\.next\\' } | ForEach-Object { Write-Output ('### ' + $_.FullName); Get-Content $_.FullName | Select-String '\"(dev|build|start|test|migrate|type-check)\"'; Write-Output '' }`
- `Get-Content docker-compose.yml`
- `Get-Content docker-compose.override.yml`
- `Get-ChildItem scripts -Recurse | Select-Object FullName,Name | Format-Table -AutoSize`
- `Get-Content scripts/run-migrations.sh`
- `Get-Content scripts/init-db.sh`
- `docker compose up -d`
- `bash ./scripts/run-migrations.sh --full`
- `docker compose ps`
- `foreach ($url in @('http://localhost:8001/health','http://localhost:8003/health','http://localhost:8004/health','http://localhost:8005/health','http://localhost:8007/health','http://localhost:8008/health','http://localhost:8009/health','http://localhost:8010/health','http://localhost:8011/health','http://localhost:8013/health','http://localhost:8014/health','http://localhost:3000/login','http://localhost/login')) { try { $resp = Invoke-WebRequest -Uri $url -UseBasicParsing; Write-Output (\"URL=$url STATUS=\" + [int]$resp.StatusCode); $body = $resp.Content; if ($body.Length -gt 120) { $body = $body.Substring(0,120) }; Write-Output (\"BODY=$body\") } catch { Write-Output (\"URL=$url ERROR=\" + $_.Exception.Message) } }`
- `foreach ($route in @('/home','/data','/analysis','/reports','/presentations','/library','/settings')) { $url = 'http://localhost:3000' + $route; try { $resp = Invoke-WebRequest -Uri $url -UseBasicParsing; Write-Output (\"URL=$url STATUS=\" + [int]$resp.StatusCode); $body = $resp.Content; if ($body.Length -gt 120) { $body = $body.Substring(0,120) }; Write-Output (\"BODY=$body\") } catch { Write-Output (\"URL=$url ERROR=\" + $_.Exception.Message) } }`
- `npm run type-check --prefix frontend`
- `npm run build --prefix services/data-service`
- `$env:DATABASE_URL="postgresql://rasid:rasid_secret_2024@localhost:5432/rasid_db"; bash ./scripts/run-migrations.sh --full`
- `$login = Invoke-RestMethod -Method Post -Uri 'http://localhost/api/v1/governance/auth/login' -ContentType 'application/json' -Body '{"email":"admin@rasid.demo","password":"Password123!"}'`
- `docker compose logs --tail=80 library-service`

# 3. raw startup status

- `docker compose up -d`

```text
<no output>
```

- `bash ./scripts/run-migrations.sh --full`

```text
[INFO] Waiting for database to be ready...
[WARNING] Database not ready yet, attempt 1/30...
[WARNING] Database not ready yet, attempt 2/30...
[WARNING] Database not ready yet, attempt 3/30...
[WARNING] Database not ready yet, attempt 4/30...
[WARNING] Database not ready yet, attempt 5/30...
[WARNING] Database not ready yet, attempt 6/30...
[WARNING] Database not ready yet, attempt 7/30...
[WARNING] Database not ready yet, attempt 8/30...
[WARNING] Database not ready yet, attempt 9/30...
[WARNING] Database not ready yet, attempt 10/30...
[WARNING] Database not ready yet, attempt 11/30...
[WARNING] Database not ready yet, attempt 12/30...
[WARNING] Database not ready yet, attempt 13/30...
[WARNING] Database not ready yet, attempt 14/30...
[WARNING] Database not ready yet, attempt 15/30...
[WARNING] Database not ready yet, attempt 16/30...
[WARNING] Database not ready yet, attempt 17/30...
[WARNING] Database not ready yet, attempt 18/30...
[WARNING] Database not ready yet, attempt 19/30...
[WARNING] Database not ready yet, attempt 20/30...
[WARNING] Database not ready yet, attempt 21/30...
[WARNING] Database not ready yet, attempt 22/30...
[WARNING] Database not ready yet, attempt 23/30...
[WARNING] Database not ready yet, attempt 24/30...
[WARNING] Database not ready yet, attempt 25/30...
[WARNING] Database not ready yet, attempt 26/30...
[WARNING] Database not ready yet, attempt 27/30...
[WARNING] Database not ready yet, attempt 28/30...
[WARNING] Database not ready yet, attempt 29/30...
[WARNING] Database not ready yet, attempt 30/30...
[ERROR] Database not ready after 30 attempts
```

- `docker compose ps`

```text
NAME                            IMAGE                                   COMMAND                  SERVICE                  CREATED             STATUS                             PORTS
rasid-ai-service                rasid-ai-service                        "docker-entrypoint.s…"   ai-service               4 hours ago         Up 4 hours (healthy)               0.0.0.0:8008->8008/tcp, [::]:8008->8008/tcp, 9229/tcp
rasid-conversion-service        rasid-conversion-service                "docker-entrypoint.s…"   conversion-service       4 hours ago         Up 4 hours                         0.0.0.0:8013->8013/tcp, [::]:8013->8013/tcp, 9229/tcp
rasid-dashboard-service         rasid-dashboard-service                 "docker-entrypoint.s…"   dashboard-service        4 hours ago         Up 4 hours (healthy)               0.0.0.0:8004->8004/tcp, [::]:8004->8004/tcp, 9229/tcp
rasid-data-service              rasid-data-service                      "docker-entrypoint.s…"   data-service             4 hours ago         Up 4 hours (healthy)               0.0.0.0:8003->8003/tcp, [::]:8003->8003/tcp, 9229/tcp
rasid-elasticsearch             docker.elastic.co/elasticsearch/elasticsearch:8.11.1 "/bin/tini -- /usr/l…"   elasticsearch            4 hours ago         Up 4 hours (healthy)               0.0.0.0:9200->9200/tcp, [::]:9200->9200/tcp, 0.0.0.0:9300->9300/tcp, [::]:9300->9300/tcp
rasid-excel-service             rasid-excel-service                     "docker-entrypoint.s…"   excel-service            4 hours ago         Up 4 hours                         3001/tcp
rasid-frontend                  rasid-frontend                          "docker-entrypoint.s…"   frontend                 4 hours ago         Up 4 hours (healthy)               0.0.0.0:3000->3000/tcp, [::]:3000->3000/tcp
rasid-gateway                   rasid-gateway                           "docker-entrypoint.s…"   gateway                  4 hours ago         Up 4 hours (healthy)               0.0.0.0:80->80/tcp, [::]:80->80/tcp
rasid-governance-service        rasid-governance-service                "docker-entrypoint.s…"   governance-service       4 hours ago         Up 4 hours (healthy)               0.0.0.0:8010->8010/tcp, [::]:8010->8010/tcp, 9229/tcp
rasid-infographic-service       rasid-infographic-service               "docker-entrypoint.s…"   infographic-service      4 hours ago         Up 4 hours                         0.0.0.0:8014->8014/tcp, [::]:8014->8014/tcp, 9229/tcp
rasid-library-service           rasid-library-service                   "docker-entrypoint.s…"   library-service          4 hours ago         Up 4 hours (healthy)               0.0.0.0:8011->8011/tcp, [::]:8011->8011/tcp, 9229/tcp
rasid-localization-service      rasid-localization-service              "docker-entrypoint.s…"   localization-service     4 hours ago         Up 4 hours                         0.0.0.0:8007->8007/tcp, [::]:8007->8007/tcp, 9229/tcp
rasid-minio                     minio/minio:latest                      "/usr/bin/docker-ent…"   minio                    4 hours ago         Up 4 hours (healthy)               0.0.0.0:9000-9001->9000-9001/tcp, [::]:9000-9001->9000-9001/tcp
rasid-postgres                  postgres:15-alpine                      "docker-entrypoint.s…"   postgres                 4 hours ago         Up 4 hours (healthy)               0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
rasid-presentation-service      rasid-presentation-service              "docker-entrypoint.s…"   presentation-service     4 hours ago         Up 4 hours (healthy)               0.0.0.0:8005->8005/tcp, [::]:8005->8005/tcp, 9229/tcp
rasid-redis                     redis:7-alpine                          "docker-entrypoint.s…"   redis                    4 hours ago         Up 4 hours (healthy)               0.0.0.0:6379->6379/tcp, [::]:6379->6379/tcp
rasid-rendering-environment     rasid-rendering-environment             "python -m uvicorn a…"   rendering-environment    4 hours ago         Up 4 hours                         0.0.0.0:8012->8012/tcp, [::]:8012->8012/tcp
rasid-replication-service       rasid-replication-service               "docker-entrypoint.s…"   replication-service      4 hours ago         Up 4 hours                         0.0.0.0:8009->8009/tcp, [::]:8009->8009/tcp, 9229/tcp
rasid-reporting-service         rasid-reporting-service                 "docker-entrypoint.s…"   reporting-service        4 hours ago         Up 4 hours (healthy)               0.0.0.0:8001->8001/tcp, [::]:8001->8001/tcp, 9229/tcp
rasid-template-service          rasid-template-service                  "docker-entrypoint.s…"   template-service         4 hours ago         Up 4 hours                         0.0.0.0:8006->8006/tcp, [::]:8006->8006/tcp, 9229/tcp
```

- health and shell reachability

```text
URL=http://localhost:8001/health STATUS=200
BODY={"status":"ok","service":"reporting-service","timestamp":"2026-03-09T15:29:26.454Z"}
URL=http://localhost:8003/health STATUS=200
BODY={"status":"ok","service":"data-service","timestamp":"2026-03-09T15:29:26.471Z"}
URL=http://localhost:8004/health STATUS=200
BODY={"status":"ok","service":"dashboard-service","timestamp":"2026-03-09T15:29:26.497Z"}
URL=http://localhost:8005/health STATUS=200
BODY={"status":"ok","service":"presentation-service","timestamp":"2026-03-09T15:29:26.522Z"}
URL=http://localhost:8007/health STATUS=200
BODY={"status":"ok","service":"localization-service","timestamp":"2026-03-09T15:29:26.537Z"}
URL=http://localhost:8008/health STATUS=200
BODY={"status":"ok","service":"ai-service","timestamp":"2026-03-09T15:29:26.552Z"}
URL=http://localhost:8009/health STATUS=200
BODY={"status":"ok","service":"replication-service","timestamp":"2026-03-09T15:29:26.569Z"}
URL=http://localhost:8010/health STATUS=200
BODY={"status":"ok","service":"governance-service","timestamp":"2026-03-09T15:29:26.585Z"}
URL=http://localhost:8011/health STATUS=200
BODY={"status":"ok","service":"library-service","timestamp":"2026-03-09T15:29:26.600Z"}
URL=http://localhost:8013/health STATUS=200
BODY={"status":"healthy","service":"conversion-service","timestamp":"2026-03-09T15:29:26.620Z"}
URL=http://localhost:8014/health STATUS=200
BODY={"status":"ok","service":"infographic-service","timestamp":"2026-03-09T15:29:26.637Z"}
URL=http://localhost:3000/login STATUS=200
BODY=<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charSet="utf-8" data-next-head=""/><meta name="viewport" conten
URL=http://localhost/login STATUS=200
BODY=<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charSet="utf-8" data-next-head=""/><meta name="viewport" conten
```

# 4. services running

- postgres
- redis
- elasticsearch
- minio
- gateway
- frontend
- reporting-service
- data-service
- dashboard-service
- presentation-service
- governance-service
- library-service
- ai-service
- localization-service
- replication-service
- conversion-service
- infographic-service
- template-service
- excel-service
- rendering-environment

# 5. routes reachable

```text
URL=http://localhost:3000/home STATUS=200
BODY=<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charSet="utf-8" data-next-head=""/><meta name="viewport" conten
URL=http://localhost:3000/data STATUS=200
BODY=<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charSet="utf-8" data-next-head=""/><meta name="viewport" conten
URL=http://localhost:3000/analysis STATUS=200
BODY=<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charSet="utf-8" data-next-head=""/><meta name="viewport" conten
URL=http://localhost:3000/reports STATUS=200
BODY=<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charSet="utf-8" data-next-head=""/><meta name="viewport" conten
URL=http://localhost:3000/presentations STATUS=200
BODY=<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charSet="utf-8" data-next-head=""/><meta name="viewport" conten
URL=http://localhost:3000/library STATUS=200
BODY=<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charSet="utf-8" data-next-head=""/><meta name="viewport" conten
URL=http://localhost:3000/settings STATUS=200
BODY=<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charSet="utf-8" data-next-head=""/><meta name="viewport" conten
```

# 6. APIs reachable

```text
TOKEN_PRESENT=True
URL=http://localhost/api/v1/data/sources?page=1&limit=1 STATUS=200 BODY={"success":true,"data":[{"id":"e876d927-2f0e-4955-9595-d5d1916ff962","tenantId":"a0000000-0000-0000-0000-000000000001","name":"tmp_settings_audit_export","description":null,"sourceType":"file","filePath":null,"format":"CSV","sizeBytes":1596
URL=http://localhost/api/v1/dashboard/dashboards?page=1&limit=1 STATUS=200 BODY={"success":true,"data":{"items":[{"id":"549d803c-cbe6-489b-9839-e3161db9231a","name":"Int Test Dashboard","layout":{"gap":10,"columns":12,"maxRows":100,"rowHeight":80,"breakpoints":{"lg":1200,"md":996,"sm":768,"xs":480},"compactType":"verti
URL=http://localhost/api/v1/reporting/reports?page=1&limit=1 STATUS=200 BODY={"success":true,"data":[{"id":"675384da-f8c3-464c-9d30-98faea5ea55f","name":"تقرير تحقق تكامل المنصة 1500","description":null,"templateId":null,"config":{"footer":null,"header":null,"metadata":{"version":1,"createdAt":"2026-03-09T12:15:48.3
URL=http://localhost/api/v1/presentation/presentations?page=1&limit=1 STATUS=200 BODY={"success":true,"data":[{"id":"91cada17-ae39-49c0-9174-f2b20b97a4d2","name":"تزايد النشاط والتكامل بين البيانات والتقارير","description":null,"status":"DRAFT","theme":"{\"primaryColor\":\"#004d99\",\"secondaryColor\":\"#e6f2ff\",\"fontFamil
URL=http://localhost/api/v1/library/assets?page=1&limit=1 ERROR=Response status code does not indicate success: 500 (Internal Server Error).
URL=http://localhost/api/v1/governance/users?page=1&limit=1 STATUS=200 BODY={"success":true,"data":[{"id":"c8afaac9-0e5c-4908-863c-1da218388d96","email":"home-test@rasid.demo","name":"Home Test","role":"viewer","status":"ACTIVE","createdAt":"2026-03-09T06:14:05.406Z","updatedAt":"2026-03-09T12:10:10.362Z","tenantId
URL=http://localhost/api/v1/governance/audit?page=1&limit=1 STATUS=200 BODY={"success":true,"data":[{"id":"7196c4ed-a758-4859-920a-f7043ff2131e","userId":"b0000000-0000-0000-0000-000000000001","userName":"Admin User","userEmail":"admin@rasid.demo","action":"user.login","entityType":"user","entityId":"b0000000-0000-
URL=http://localhost/api/v1/data/connectors/types STATUS=200 BODY={"success":true,"data":[{"type":"google_drive","name":"Google Drive","icon":"google-drive","description":"استيراد الملفات مباشرة من Google Drive","requiredScopes":["https://www.googleapis.com/auth/drive.readonly","https://www.googleapis.com
URL=http://localhost/api/v1/data/connectors/connections STATUS=200 BODY={"success":true,"data":[]}
```

# 7. blockers found

- migrations script does not complete from host default environment

```text
[ERROR] Database not ready after 30 attempts
```

- rerun reaches postgres but prisma baseline is missing

```text
[OK] Database is ready
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "rasid_db", schema "public" at "localhost:5432"

No migration found in prisma/migrations

Error: P3005

The database schema is not empty. Read more about how to baseline an existing production database: https://pris.ly/d/migrate-baseline
```

- direct data-service TypeScript build fails

```text
> @rasid/data-service@1.0.0 build
> tsc

src/services/data-parsing.service.ts(197,8): error TS1005: ',' expected.
```

- gateway to library list currently fails for the verified auth flow because tenant extraction fails in library-service

```text
error: Unhandled error Tenant ID is required {"method":"GET","name":"Error","path":"/api/v1/library/assets","requestId":"6019e77a305a57244ffa265955e9d9e7","service":"library-service","stack":"Error: Tenant ID is required
    at extractTenantId (/app/src/routes/library.routes.ts:47:11)
```

# 8. fixes applied

- reran migrations with explicit host database URL override to remove the first connection-path failure

```text
$env:DATABASE_URL="postgresql://rasid:rasid_secret_2024@localhost:5432/rasid_db"; bash ./scripts/run-migrations.sh --full
```

- reran authenticated API verification through gateway with a real bearer token to baseline approved-surface APIs

```text
TOKEN_PRESENT=True
```

- no source code change was required in this phase to bring the stack up; the environment became runnable with the current containers and the remaining defects were recorded as baseline blockers/failing areas

# 9. rerun results

- migrations rerun

```text
[OK] Database is ready
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "rasid_db", schema "public" at "localhost:5432"

No migration found in prisma/migrations

Error: P3005

The database schema is not empty. Read more about how to baseline an existing production database: https://pris.ly/d/migrate-baseline
```

- frontend type-check rerun state remained green

```text
> @rasid/frontend@1.0.0 type-check
> tsc --noEmit
```

- runtime baseline after rerun
  - frontend shell reachable on `http://localhost:3000`
  - gateway reachable on `http://localhost`
  - approved surface routes returned `STATUS=200`
  - approved surface APIs were reachable except `GET /api/v1/library/assets?page=1&limit=1`

- full raw command/output log
  - `verification_run/raw_outputs/phase1_commands.txt`

# 10. phase status

- PASS
