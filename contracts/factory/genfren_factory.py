# { "Depends": "py-genlayer:test" }
from dataclasses import dataclass

from genlayer import *


@allow_storage
@dataclass
class AgentTemplate:
    archetype: str
    display_name: str
    system_prompt: str
    can_create_subagents: bool
    can_draft_content: bool
    max_daily_runs: u256
    max_active_subagents: u256


@allow_storage
@dataclass
class AgentRegistryEntry:
    owner: Address
    payment_tx_hash: str
    contract_address: str
    archetype: str
    status: str


class GenFrenFactory(gl.Contract):
    owner: Address
    treasury_wallet: str
    creation_fee_gen: u256
    templates: TreeMap[str, AgentTemplate]
    owner_to_agent: TreeMap[Address, AgentRegistryEntry]
    payment_authorizations: TreeMap[str, Address]

    def __init__(self, treasury_wallet: str):
        self.owner = gl.message.sender_address
        self.treasury_wallet = treasury_wallet
        self.creation_fee_gen = u256(10)
        self.templates["research"] = AgentTemplate(
            archetype="research",
            display_name="Research Agent",
            system_prompt="Persistent research specialist focused on approved evidence sources.",
            can_create_subagents=True,
            can_draft_content=True,
            max_daily_runs=u256(8),
            max_active_subagents=u256(3),
        )
        self.templates["briefing"] = AgentTemplate(
            archetype="briefing",
            display_name="Briefing Agent",
            system_prompt="Produces recurring concise briefings with explicit confidence levels.",
            can_create_subagents=False,
            can_draft_content=False,
            max_daily_runs=u256(6),
            max_active_subagents=u256(1),
        )
        self.templates["goal-coach"] = AgentTemplate(
            archetype="goal-coach",
            display_name="Goal Coach Agent",
            system_prompt="Tracks ongoing goals, drift, and follow-up actions.",
            can_create_subagents=True,
            can_draft_content=False,
            max_daily_runs=u256(6),
            max_active_subagents=u256(2),
        )
        self.templates["project-tracker"] = AgentTemplate(
            archetype="project-tracker",
            display_name="Project Tracker Agent",
            system_prompt="Monitors project state and unresolved action items over time.",
            can_create_subagents=True,
            can_draft_content=False,
            max_daily_runs=u256(8),
            max_active_subagents=u256(2),
        )
        self.templates["content-draft"] = AgentTemplate(
            archetype="content-draft",
            display_name="Content Draft Agent",
            system_prompt="Drafts posts and summaries based only on approved evidence.",
            can_create_subagents=False,
            can_draft_content=True,
            max_daily_runs=u256(4),
            max_active_subagents=u256(1),
        )

    def _assert_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.UserError("Only factory owner may perform this action.")

    @gl.public.write
    def authorize_payment(self, payment_tx_hash: str, beneficiary: Address) -> None:
        self._assert_owner()
        self.payment_authorizations[payment_tx_hash] = beneficiary

    @gl.public.write
    def create_agent_for(
        self,
        beneficiary: Address,
        payment_tx_hash: str,
        archetype: str,
        contract_address: str,
    ) -> None:
        self._assert_owner()
        if archetype not in self.templates:
            raise gl.UserError("Unsupported agent archetype.")
        if payment_tx_hash not in self.payment_authorizations:
            raise gl.UserError("Payment not authorized.")
        if self.payment_authorizations[payment_tx_hash] != beneficiary:
            raise gl.UserError("Payment proof does not belong to beneficiary.")
        if beneficiary in self.owner_to_agent:
            raise gl.UserError("Beneficiary already has a primary GenFren agent.")

        self.owner_to_agent[beneficiary] = AgentRegistryEntry(
            owner=beneficiary,
            payment_tx_hash=payment_tx_hash,
            contract_address=contract_address,
            archetype=archetype,
            status="active",
        )

    @gl.public.view
    def get_agent(self, owner: Address) -> dict:
        entry = self.owner_to_agent[owner]
        return {
            "owner": str(entry.owner),
            "payment_tx_hash": entry.payment_tx_hash,
            "contract_address": entry.contract_address,
            "archetype": entry.archetype,
            "status": entry.status,
        }

    @gl.public.view
    def get_template(self, archetype: str) -> dict:
        template = self.templates[archetype]
        return {
            "archetype": template.archetype,
            "display_name": template.display_name,
            "system_prompt": template.system_prompt,
            "can_create_subagents": template.can_create_subagents,
            "can_draft_content": template.can_draft_content,
            "max_daily_runs": str(template.max_daily_runs),
            "max_active_subagents": str(template.max_active_subagents),
        }
