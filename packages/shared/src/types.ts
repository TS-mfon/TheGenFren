export type AgentArchetype =
  | "research"
  | "briefing"
  | "goal-coach"
  | "project-tracker"
  | "content-draft";

export type DelegationRole = "viewer" | "operator" | "admin";
export type TaskStatus = "scheduled" | "running" | "completed" | "failed" | "paused";
export type ConfidenceLevel = "high" | "medium" | "low";
export type ConsensusState = "verified" | "contested" | "degraded";
export type AgentStatus = "pending_payment" | "provisioning" | "active" | "paused";

export interface User {
  id: string;
  username: string;
  email: string;
  walletAddress: string;
  status: "pending_payment" | "active";
  createdAt?: string;
}

export interface PaymentReceipt {
  id: string;
  userId: string;
  network: "bradbury";
  amountGen: number;
  treasuryAddress: string;
  senderAddress?: string;
  txHash: string;
  confirmedAt: string | null;
  status: "pending_submission" | "submitted" | "confirmed" | "rejected";
  rejectionReason?: string;
}

export interface AutonomyPolicy {
  maxDailyRuns: number;
  maxActiveSubagents: number;
  allowedSourceClasses: string[];
  canDraftContent: boolean;
  canCreateSubagents: boolean;
  canScheduleMonitoring: boolean;
}

export interface Goal {
  id: string;
  topic: string;
  objective: string;
  sourceUrls: string[];
  cadence: "daily" | "weekly";
  tone: "concise" | "analytical" | "casual";
  status: "active" | "paused";
}

export interface Briefing {
  id: string;
  agentId?: string;
  goalId?: string | null;
  title: string;
  summary: string;
  confidence: ConfidenceLevel;
  consensusState: ConsensusState;
  sourceRefs?: Array<{ url: string; title?: string }>;
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  type: "short-term" | "long-term" | "goal" | "behavioral" | "branch";
  summary: string;
  importance: "high" | "medium" | "low";
  createdAt: string;
}

export interface TaskRun {
  id: string;
  taskId?: string;
  name: string;
  status: TaskStatus;
  scheduledFor: string;
  lastResult: string;
}

export interface SubAgent {
  id: string;
  name: string;
  archetype: AgentArchetype;
  role: string;
  status: "active" | "paused";
  contractAddress?: string;
}

export interface DelegationGrant {
  id: string;
  handle: string;
  role: DelegationRole;
  grantedAt: string;
  delegateAddress?: string;
}

export interface AgentRecord {
  id: string;
  ownerId: string;
  name: string;
  archetype: AgentArchetype;
  status: AgentStatus;
  contractAddress: string;
  factoryContractAddress?: string;
  subagents: SubAgent[];
  policy: AutonomyPolicy;
  goals: Goal[];
}

export interface AgentSnapshot {
  user: User;
  payment: PaymentReceipt | null;
  agent: AgentRecord | null;
  briefings: Briefing[];
  tasks: TaskRun[];
  memory: MemoryItem[];
  delegation: DelegationGrant[];
}

export interface SignupPayload {
  username: string;
  email: string;
  password: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyNonce: string;
  vaultSalt: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface CreateAgentPayload {
  name: string;
  archetype: AgentArchetype;
  topic: string;
  objective: string;
  sourceUrls: string[];
  tone: Goal["tone"];
  cadence: Goal["cadence"];
}
