# Rasid Platform - Testing Documentation

## Testing Strategy

Rasid uses a multi-layer testing approach:

```
Unit Tests           -> Individual service class methods
Integration Tests    -> Cross-component interactions within a service
Visual Regression    -> Pixel-level document comparison
Health Check Tests   -> Service availability verification
```

## Test Infrastructure

- **Framework**: Jest with ts-jest
- **Assertion**: Jest built-in matchers
- **Location**: `src/__tests__/` within each service
- **Naming**: `*.test.ts` or `*.spec.ts`

## Test Directories by Service

| Service | Test Location | Focus Areas |
|---------|---------------|-------------|
| data-service | src/__tests__/ | File ingestion, parsing, data quality |
| excel-service | src/__tests__/ | Formula evaluation, matching, formatting |
| dashboard-service | src/__tests__/ | Widget engine, filter logic |
| reporting-service | src/__tests__/ | Report generation, scheduling |
| presentation-service | src/__tests__/ | Slide generation, animations |
| localization-service | src/__tests__/ | Translation, RTL, quality |
| conversion-service | src/__tests__/ | Format conversion, OCR |
| ai-service | src/__tests__/ | NLP, RAG, embeddings |
| governance-service | src/__tests__/ | Auth, RBAC, audit |
| infographic-service | src/__tests__/ | Layout engine, visualization |
| library-service | src/__tests__/, src/__mocks__/ | Asset management, search |
| replication-service | src/__tests__/, src/tests/ | Pixel validation, replication |
| template-service | src/__tests__/ | Template CRUD, versioning |

## Example: Excel Service Integration Tests

The excel-service has comprehensive integration tests at `src/__tests__/integration.test.ts`:

```typescript
describe('Integration Tests', () => {
  // Formula Registry: 106+ registered functions
  it('should have 106+ registered functions');
  it('should execute SUM through registry');
  it('should execute IF through registry');
  it('should execute CONCATENATE through registry');
  it('should execute financial functions (SLN)');
  it('should have all categories represented');

  // Conversion Service: date, currency, text
  it('should convert date formats');
  it('should convert currencies');
  it('should normalize text');
  it('should detect Arabic text');
  it('should detect English text');

  // Formula Workers: batch evaluation
  it('should evaluate batch of simple expressions');

  // Formula Intelligence: optimization
  it('should simplify redundant IF');
  it('should suggest IFS for nested IFs');

  // Formula Chaining
  it('should chain INDEX + MATCH');
  it('should chain SUM + IF logic');
});
```

## Running Tests

```bash
# Run all tests for a service
cd services/excel-service
npx jest

# Run specific test file
npx jest src/__tests__/integration.test.ts

# Run with coverage
npx jest --coverage

# Run in watch mode
npx jest --watch
```

## TypeScript Compilation as Test Gate

All services enforce zero TypeScript errors before any changes are accepted:

```bash
# Check TypeScript compilation
npx tsc --noEmit

# All 15 services must pass with 0 errors
```

Current status: **0 errors across all 15 services**.

## Visual Regression Testing

The reporting-service implements visual regression testing:

- **VisualBaseline model**: Stores baseline images for reports
- **visual-regression.service**: Compares current render vs baseline
- **rendering-environment**: Deterministic rendering for reliable comparison
- **pixelmatch**: Pixel-by-pixel comparison algorithm

### Visual Regression Flow
```
1. Generate report baseline image
2. Store as VisualBaseline in database
3. On subsequent generations:
   a. Render report via rendering-environment
   b. Compare pixels against baseline
   c. Flag any visual differences
   d. Generate diff image highlighting changes
```

## Pixel Validation (Replication)

The replication-service has dedicated pixel validation:

- **pixel-validation-loop.service**: Iterative comparison
- **comparison-engine.service**: Source vs replica analysis
- Uses rendering-environment for deterministic output
- Threshold-based acceptance (configurable diff percentage)

## Health Check Testing

```bash
# Automated health check across all services
./deploy.sh health

# Manual check for a specific service
curl -f http://localhost:8001/health
```

Health response validates:
- Service status (healthy/degraded)
- Database connectivity
- Redis connectivity
- Memory usage within bounds
- Uptime reported correctly

## Testing Conventions

1. **No mock data in production** - Tests use real service instances
2. **Isolated test data** - Tests create and clean up their own data
3. **TypeScript strict** - Tests must pass type checking
4. **Integration focus** - End-to-end paths through services preferred
5. **Arabic text** - Tests include Arabic text scenarios for RTL/localization
