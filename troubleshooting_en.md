# Troubleshooting

## Platform does not open
- Verify that `rasid-gateway` and `rasid-frontend` are running.
- Run `docker ps`.
- If the gateway is down, check the health of the backend services it depends on.

## Login fails
- Verify `governance-service`.
- In local seeded environments, ensure migrations and seeding were executed with:
- `bash ./scripts/run-migrations.sh --full`

## Upload fails in Home or Data
- Check `data-service`.
- Verify PostgreSQL and MinIO connectivity.
- Confirm file size and request limits are not being exceeded.

## Library assets do not load or asset download fails
- Check `library-service` and `minio`.
- When testing the service directly, ensure required tenant and user headers are provided.
- A MinIO/storage issue commonly appears as missing asset payload access even when metadata exists.

## Analysis page loads but no analysis result appears
- Confirm that a valid `datasetId` is being passed.
- Check `dashboard-service`.
- If datasets load but analysis payloads are empty or failing, inspect dashboard engine logs.

## Report build or export fails
- Verify `reporting-service`.
- Rebuild the report before re-attempting export.
- If export formats fail selectively, inspect template/export service logs and report output records.

## Presentation generation fails
- Verify `presentation-service`.
- For AI-backed generation, confirm `OPENAI_API_KEY` is present and valid.
- Create a blank presentation first to separate CRUD issues from AI/source-generation issues.

## Rasid knowledge base does not work
- Verify `ai-service`.
- Check PostgreSQL, Elasticsearch, and OpenAI configuration.
- Inspect RAG engine logs if ingest or query calls fail.

## Prompt template tests return no answer
- Confirm that a prompt exists and is selected.
- Verify `POST /api/v1/ai/prompts/:id/test`.
- Inspect token usage and `ai-service` logs for model/runtime errors.

## `X-Forwarded-For` warning in `ai-service`
- This is a known `express-rate-limit` warning tied to proxy trust settings.
- It is currently a warning, not a proven blocker for the approved surfaces.

## Strict visual replication is not fully accepted
- This is not only a usage issue.
- The project still has validated blockers in parts of the replication path, so strict one-to-one replication should be treated as partial capability, not fully accepted behavior.
