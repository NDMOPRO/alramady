# Rasid Platform - Security Documentation

## Authentication

### JWT-Based Authentication
- **Algorithm**: HS256 (HMAC-SHA256)
- **Token format**: Bearer token in Authorization header
- **Access token**: Configurable expiry (default: 15m)
- **Refresh token**: Configurable expiry (default: 7d)
- **Signing key**: Environment variable `JWT_SECRET`

### Token Payload
```typescript
{
  userId: string;      // Unique user identifier
  email: string;       // User email
  role: string;        // Primary role (admin, editor, viewer)
  organizationId: string; // Tenant ID for multi-tenancy
  permissions: string[];  // Fine-grained permissions
}
```

### Authentication Flow
```
1. POST /api/v1/governance/auth/login { email, password }
2. Server validates credentials against database
3. Returns { accessToken, refreshToken }
4. Client includes Authorization: Bearer <accessToken> on all requests
5. On expiry: POST /api/v1/governance/auth/refresh { refreshToken }
6. Returns new { accessToken, refreshToken }
```

### Middleware Chain
1. **authMiddleware**: Validates JWT, rejects expired/invalid tokens
2. **optionalAuth**: Allows unauthenticated but attaches user if token valid
3. **requireRole**: Enforces role-based access (admin, editor, viewer)

### Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| AUTH_MISSING_HEADER | 401 | No Authorization header |
| AUTH_INVALID_FORMAT | 401 | Not "Bearer <token>" format |
| AUTH_TOKEN_EXPIRED | 401 | Token has expired |
| AUTH_TOKEN_INVALID | 401 | Token verification failed |
| AUTH_REQUIRED | 401 | Authentication required |
| AUTH_FORBIDDEN | 403 | Insufficient role/permissions |

## Authorization

### Role-Based Access Control (RBAC)
- Roles defined per tenant: admin, editor, viewer (extensible)
- Permissions attached to roles: `{ action, resource, resourceType }`
- Actions: CREATE, READ, UPDATE, DELETE, EXECUTE, MANAGE
- Resource types: dataset, dashboard, report, presentation, etc.

### Row-Level Security (RLS)
- **rls.service**: Defines row-level filter policies per table
- **RlsPolicy model**: `{ tenantId, tableName, filter (JSON) }`
- Filters applied at query time via Prisma middleware

### Permission Delegation
- Users can delegate specific permissions to others
- Time-limited delegation with automatic expiry
- Audit logged via PermissionDelegation model

## Multi-Tenancy

### Tenant Isolation
```
Every request:
1. JWT token contains organizationId (tenant ID)
2. tenantMiddleware extracts and validates tenantId
3. All database queries are scoped: WHERE tenantId = ?
4. No cross-tenant data access is possible
```

### Tenant Context
```typescript
interface TenantContext {
  tenantId: string;
  userId: string;
}
// Available as req.tenant on all authenticated routes
```

## API Security

### Gateway Level (Nginx)
- **Rate limiting**: 100 requests/second per IP, burst 50
- **AI endpoints**: Lower burst (20) for expensive operations
- **Security headers**:
  - `X-Frame-Options: SAMEORIGIN` (clickjacking prevention)
  - `X-Content-Type-Options: nosniff` (MIME sniffing prevention)
  - `X-XSS-Protection: 1; mode=block` (XSS filter)
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **Request ID**: Auto-generated `X-Request-ID` for correlation

### Service Level
- **Helmet**: Express security headers middleware
- **CORS**: Configurable origins, methods, headers
- **Body size limits**: 50MB JSON body, 500MB file upload (Nginx)
- **Input validation**: Zod schema validation on all endpoints

### API Versioning
- URL-based versioning: `/api/v1/`, `/api/v2/`, `/api/v3/`
- Deprecation headers for sunset versions
- Version guard middleware for version-specific endpoints

## Data Security

### Encryption
- **In transit**: HTTPS (configured at load balancer/reverse proxy)
- **At rest**: PostgreSQL volume encryption (OS-level)
- **Field-level**: cell-encryption.service for sensitive fields
- **PII**: pii-redactor.service detects and redacts PII

### Sensitive Data Protection
- **SensitiveField model**: Registry of encrypted fields
- **EncryptionLog model**: Audit trail of encryption operations
- **PiiScanLog model**: PII detection scan results

## AI Security

### Prompt Injection Guard
- **prompt-injection-guard.service**: Scans user input for injection attempts
- Validates AI prompts before sending to OpenAI
- Blocks known injection patterns

### AI Safety Controls
- **ai-shutdown.service**: Emergency AI operation shutdown
- Feature flags for AI capability toggles
- Rate limiting on AI endpoints (lower burst)
- AI streaming responses disable proxy buffering

## Audit & Compliance

### Audit Logging
- Every significant action logged to AuditLog table
- Fields: `userId, tenantId, action, resource, details, timestamp`
- Immutable (append-only)
- Audit replay capability via audit-replay.ts

### Compliance
- **compliance.service**: Regulatory compliance checking
- **ComplianceCheck model**: Check results with pass/fail
- **CompliancePolicy model**: Policy definitions
- **ConsentRecord model**: User consent tracking
- **RetentionPolicy model**: Data retention rules

### Security Events
- **LoginAttempt model**: All login attempts (success/failure)
- **SecurityEvent model**: Security-relevant events (password change, role change, etc.)
- **ActionLog model**: Sensitive action logging

## Governance Features

### Workflow Approvals
- **WorkflowDefinition**: Multi-step approval workflows
- **sensitive-action-approval.service**: Require approval for sensitive operations
- **kpi-approval.service**: KPI value approval workflows

### Feature Flags
- **FeatureFlag model**: Toggle features per tenant
- **FeatureFlagRule model**: Targeting rules (user, role, percentage)
- Gradual rollout support

### Webhooks
- **Webhook model**: Outbound webhook registration
- **WebhookDelivery model**: Delivery attempt logging
- **InboundWebhookConfig/InboundWebhook**: Inbound webhook handling
- HMAC signature verification for inbound webhooks

### Data Governance
- **Policy model**: Governance policy definitions
- **data-governance.service**: Policy enforcement
- **number-freeze.service**: Financial period freezing
- **auto-archive.service**: Automated data archival
- **backup.service**: Database backup management

## External Integrations Security

### SSO
- **sso.service**: Single Sign-On (SAML/OIDC)
- **ldap.service**: LDAP/Active Directory authentication
- **microsoft365-integration.service**: Microsoft 365 SSO

### Network Security
- All containers on isolated Docker bridge network
- No public ports except gateway (:80)
- Internal services only accessible within Docker network
- Rendering environment blocks all external network requests

## Best Practices Enforced

1. **No `any` types** - TypeScript strict mode across all services
2. **Zod validation** - All API inputs validated against schemas
3. **Parameterized queries** - Prisma ORM prevents SQL injection
4. **No mock data in production** - Real implementations only
5. **Graceful shutdown** - All services handle SIGTERM/SIGINT
6. **Error sanitization** - No stack traces in production responses
7. **Secret management** - All secrets via environment variables
