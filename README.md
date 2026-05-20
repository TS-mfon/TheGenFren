# GenFren

Greenfield implementation of a persistent AI agent platform for GenLayer.

## Workspace

- `apps/web`: Next.js product UI
- `apps/api`: Fastify API
- `apps/worker`: autonomous task and payment workers
- `contracts`: GenLayer intelligent contracts
- `packages/shared`: shared types and mock data contracts
- `database`: PostgreSQL schema
- `docs`: architecture and API notes

## Status

This repository contains the first implementation pass for the full day-one platform architecture:

- embedded wallet account model
- Bradbury payment gate
- StudioNet agent deployment flow
- persistent primary agent plus specialist subagents
- delegation RBAC
- policy plus budget autonomy
- memory, briefing, task, and audit models
