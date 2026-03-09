# Rasid Platform - Documentation Index

## Architecture Documentation Suite

This documentation package provides complete system understanding for the Rasid (راصد) intelligent document and data platform.

### Written Documentation

| File | Description |
|------|-------------|
| [system-overview.md](system-overview.md) | Platform overview, engines, stack, design principles |
| [architecture.md](architecture.md) | Architectural layers, patterns, auth, caching, error handling |
| [modules.md](modules.md) | Detailed module documentation for all 15 services |
| [database.md](database.md) | Database schema, ERD, entity descriptions, ~445 models |
| [apis.md](apis.md) | Complete API reference, endpoints, request/response formats |
| [dataflows.md](dataflows.md) | 10 data flow pipelines with step-by-step descriptions |
| [infrastructure.md](infrastructure.md) | Container architecture, networking, environment variables |
| [deployment.md](deployment.md) | Deployment guide, operations, troubleshooting |
| [security.md](security.md) | Authentication, authorization, encryption, audit, compliance |
| [testing.md](testing.md) | Testing strategy, frameworks, visual regression |
| [performance.md](performance.md) | Scaling, caching, monitoring, optimization |

### Architecture Diagrams (Mermaid)

| Diagram | File | Type |
|---------|------|------|
| High-Level System Architecture | [diagrams/system-architecture.mmd](diagrams/system-architecture.mmd) | Graph |
| Service Interaction Map | [diagrams/service-map.mmd](diagrams/service-map.mmd) | Graph |
| Module Dependency Graph | [diagrams/module-dependency-graph.mmd](diagrams/module-dependency-graph.mmd) | Graph |
| Database ERD | [diagrams/database-erd.mmd](diagrams/database-erd.mmd) | ER Diagram |
| Data Flow Sequences | [diagrams/dataflows.mmd](diagrams/dataflows.mmd) | Sequence |
| Worker & Queue Architecture | [diagrams/worker-queue-architecture.mmd](diagrams/worker-queue-architecture.mmd) | Graph |
| External Integration Map | [diagrams/external-integrations.mmd](diagrams/external-integrations.mmd) | Graph |

### Viewing Diagrams

Mermaid diagrams (`.mmd` files) can be viewed using:
- **VS Code**: Install "Mermaid Preview" extension
- **GitHub**: Renders `.mmd` files automatically in PRs and markdown
- **Online**: Paste into [mermaid.live](https://mermaid.live)
- **CLI**: `npx @mermaid-js/mermaid-cli -i diagram.mmd -o diagram.svg`

## Quick Navigation

### I want to...

| Goal | Start here |
|------|-----------|
| Understand the system | [system-overview.md](system-overview.md) |
| See how services connect | [diagrams/system-architecture.mmd](diagrams/system-architecture.mmd) |
| Add a new API endpoint | [apis.md](apis.md) + [architecture.md](architecture.md) |
| Understand the database | [database.md](database.md) + [diagrams/database-erd.mmd](diagrams/database-erd.mmd) |
| Debug a data flow | [dataflows.md](dataflows.md) |
| Deploy the system | [deployment.md](deployment.md) |
| Review security | [security.md](security.md) |
| Optimize performance | [performance.md](performance.md) |
| Run tests | [testing.md](testing.md) |
| Understand a specific service | [modules.md](modules.md) |

## Platform Stats

| Metric | Count |
|--------|-------|
| Microservices | 15 |
| Docker containers | 19 |
| Database models | ~445 |
| Database enums | ~104 |
| Service classes | ~200+ |
| Route files | ~100+ |
| API endpoints | ~200+ |
| Excel formula functions | 106+ |
| TypeScript errors | 0 |
