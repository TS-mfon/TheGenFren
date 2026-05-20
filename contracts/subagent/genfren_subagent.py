# { "Depends": "py-genlayer:test" }
from dataclasses import dataclass

from genlayer import *


@allow_storage
@dataclass
class SubAgentPolicy:
    role: str
    max_daily_runs: u256
    can_schedule_monitoring: bool
    can_draft_content: bool
    allowed_sources_csv: str


class GenFrenSubAgent(gl.Contract):
    owner_agent: Address
    name: str
    archetype: str
    policy: SubAgentPolicy

    def __init__(
        self,
        owner_agent: Address,
        name: str,
        archetype: str,
        role: str,
        max_daily_runs: u256,
        can_schedule_monitoring: bool,
        can_draft_content: bool,
        allowed_sources_csv: str,
    ):
        self.owner_agent = owner_agent
        self.name = name
        self.archetype = archetype
        self.policy = SubAgentPolicy(
            role=role,
            max_daily_runs=max_daily_runs,
            can_schedule_monitoring=can_schedule_monitoring,
            can_draft_content=can_draft_content,
            allowed_sources_csv=allowed_sources_csv,
        )

    @gl.public.view
    def get_profile(self) -> dict:
        return {
            "owner_agent": str(self.owner_agent),
            "name": self.name,
            "archetype": self.archetype,
            "role": self.policy.role,
            "max_daily_runs": str(self.policy.max_daily_runs),
            "can_schedule_monitoring": self.policy.can_schedule_monitoring,
            "can_draft_content": self.policy.can_draft_content,
            "allowed_sources_csv": self.policy.allowed_sources_csv,
        }
