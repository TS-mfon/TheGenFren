# GenFren architecture

## Networks

- `GenLayer Bradbury`: fixed 10 GEN payment confirmation
- `StudioNet`: agent and subagent intelligent contracts

The Bradbury payment is a hard gate. Users do not get agent deployment access until the backend verifies a confirmed payment receipt and authorizes the factory contract mapping used for StudioNet deployment.

## Contract topology

- `GenFrenFactory`: template registry and ownership registry
- `GenFrenAgent`: one persistent primary agent per user
- `GenFrenSubAgent`: long-lived specialist agents created from approved templates

## Service topology

- `Auth Service`: session, password, embedded wallet bootstrap
- `Payment Verification Service`: Bradbury receipt verification and factory authorization sync
- `Agent Orchestrator`: prompt assembly, policy enforcement, subagent routing
- `Memory Service`: retrieval, compression, branch recall, embeddings
- `Scheduler`: recurring tasks and quotas
- `Notification Service`: inbox and dashboard delivery
- `Audit Service`: delegation and execution trace

## Product boundaries

The platform implements all day-one features from the plan, but agent creation is limited to supported archetypes so the factory contract can deploy stable and testable contracts.
