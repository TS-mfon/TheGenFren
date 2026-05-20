# { "Depends": "py-genlayer:test" }
import json
from dataclasses import dataclass

from genlayer import *


ERROR_EXPECTED = "[EXPECTED]"
ERROR_LLM = "[LLM_ERROR]"
ERROR_TRANSIENT = "[TRANSIENT]"


@allow_storage
@dataclass
class GoalRecord:
    topic: str
    objective: str
    cadence: str
    tone: str
    status: str


@allow_storage
@dataclass
class MemorySummary:
    category: str
    summary: str
    importance: str
    memory_hash: str
    created_at: str


@allow_storage
@dataclass
class PolicyRecord:
    max_daily_runs: u256
    max_active_subagents: u256
    can_create_subagents: bool
    can_schedule_monitoring: bool
    can_draft_content: bool
    allowed_sources_csv: str


class GenFrenAgent(gl.Contract):
    owner: Address
    factory: Address
    name: str
    archetype: str
    system_prompt: str
    goals: TreeMap[str, GoalRecord]
    memory: TreeMap[str, MemorySummary]
    subagents: TreeMap[str, str]
    delegations: TreeMap[Address, str]
    policy: PolicyRecord

    def __init__(self, owner: Address, factory: Address, name: str, archetype: str, system_prompt: str):
        self.owner = owner
        self.factory = factory
        self.name = name
        self.archetype = archetype
        self.system_prompt = system_prompt
        self.policy = PolicyRecord(
            max_daily_runs=u256(8),
            max_active_subagents=u256(3),
            can_create_subagents=True,
            can_schedule_monitoring=True,
            can_draft_content=True,
            allowed_sources_csv="official-docs,company-sites,public-apis",
        )

    def _assert_owner_or_admin(self) -> None:
        if gl.message.sender_address == self.owner:
            return
        if gl.message.sender_address in self.delegations and self.delegations[gl.message.sender_address] == "admin":
            return
        raise gl.UserError("Only owner or admin delegate may perform this action.")

    def _parse_reasoning_json(self, payload: str) -> dict:
        try:
            parsed = json.loads(payload)
        except Exception:
            raise gl.vm.UserError(f"{ERROR_LLM} Invalid JSON returned by model.")
        if not isinstance(parsed, dict):
            raise gl.vm.UserError(f"{ERROR_LLM} Reasoning output must be an object.")
        required = ["title", "summary", "confidence", "consensus_state"]
        for field in required:
            if field not in parsed:
                raise gl.vm.UserError(f"{ERROR_LLM} Missing field: {field}")
        return parsed

    @gl.public.write
    def set_goal(self, goal_id: str, topic: str, objective: str, cadence: str, tone: str) -> None:
        self._assert_owner_or_admin()
        self.goals[goal_id] = GoalRecord(
            topic=topic,
            objective=objective,
            cadence=cadence,
            tone=tone,
            status="active",
        )

    @gl.public.write
    def add_memory_summary(
        self,
        memory_id: str,
        category: str,
        summary: str,
        importance: str,
        memory_hash: str,
        created_at: str,
    ) -> None:
        self._assert_owner_or_admin()
        self.memory[memory_id] = MemorySummary(
            category=category,
            summary=summary,
            importance=importance,
            memory_hash=memory_hash,
            created_at=created_at,
        )

    @gl.public.write
    def grant_delegate(self, delegate: Address, role: str) -> None:
        self._assert_owner_or_admin()
        if role not in ["viewer", "operator", "admin"]:
            raise gl.UserError(f"{ERROR_EXPECTED} Invalid delegation role.")
        self.delegations[delegate] = role

    @gl.public.write
    def register_subagent(self, subagent_id: str, contract_address: str) -> None:
        self._assert_owner_or_admin()
        self.subagents[subagent_id] = contract_address

    @gl.public.view
    def reason(self, goal_context: str, memory_context: str, evidence_json: str, user_message: str) -> dict:
        prompt = (
            "You are the persistent reasoning core of GenFren. "
            "Use the user's goal, memory, current message, and evidence pack to produce a concise JSON object "
            "with keys title, summary, confidence, consensus_state, and next_actions. "
            "Confidence must be one of high, medium, low. consensus_state must be one of verified, contested, degraded. "
            "Never claim actions were executed unless the evidence proves it.\n"
            f"System prompt: {self.system_prompt}\n"
            f"Goal context: {goal_context}\n"
            f"Memory context: {memory_context}\n"
            f"Evidence JSON: {evidence_json}\n"
            f"User message: {user_message}\n"
        )

        def leader_fn():
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            return self._parse_reasoning_json(json.dumps(result))

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            validator_result = leader_fn()
            leader_result = leaders_res.calldata
            if leader_result["confidence"] != validator_result["confidence"]:
                return False
            if leader_result["consensus_state"] != validator_result["consensus_state"]:
                return False
            leader_summary = str(leader_result["summary"]).strip().lower()
            validator_summary = str(validator_result["summary"]).strip().lower()
            return len(leader_summary) > 0 and len(validator_summary) > 0

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    @gl.public.view
    def get_agent_profile(self) -> dict:
        return {
            "owner": str(self.owner),
            "name": self.name,
            "archetype": self.archetype,
            "system_prompt": self.system_prompt,
            "policy": {
                "max_daily_runs": str(self.policy.max_daily_runs),
                "max_active_subagents": str(self.policy.max_active_subagents),
                "can_create_subagents": self.policy.can_create_subagents,
                "can_schedule_monitoring": self.policy.can_schedule_monitoring,
                "can_draft_content": self.policy.can_draft_content,
                "allowed_sources_csv": self.policy.allowed_sources_csv,
            },
        }

    @gl.public.view
    def get_goal(self, goal_id: str) -> dict:
        goal = self.goals[goal_id]
        return {
            "topic": goal.topic,
            "objective": goal.objective,
            "cadence": goal.cadence,
            "tone": goal.tone,
            "status": goal.status,
        }
