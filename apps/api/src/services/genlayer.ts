import { createHash } from "node:crypto";

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { config } from "../config.js";
import { readContract } from "../lib/contracts.js";

const studioChain = config.STUDIONET_RPC_URL
  ? {
      ...studionet,
      rpcUrls: {
        ...studionet.rpcUrls,
        default: { http: [config.STUDIONET_RPC_URL] }
      }
    }
  : studionet;

function requirePlatformKey() {
  if (!config.PLATFORM_PRIVATE_KEY) {
    throw new Error("PLATFORM_PRIVATE_KEY is required for contract deployment.");
  }
  return privateKeyToAccount(config.PLATFORM_PRIVATE_KEY as `0x${string}`);
}

function studioClient() {
  return createClient({
    chain: studioChain,
    account: requirePlatformKey()
  });
}

export async function deployContractFromCode(code: string, args: unknown[]) {
  const client = studioClient();
  const txHash = await client.deployContract({
    code,
    args: args as any[]
  });
  const receipt = await client.waitForTransactionReceipt({
    hash: txHash as any,
    status: TransactionStatus.ACCEPTED,
    retries: 60,
    interval: 5000
  });
  const data = receipt as Record<string, any>;
  const contractAddress = data.data?.contract_address ?? data.txDataDecoded?.contractAddress ?? "";
  if (!contractAddress) {
    throw new Error("Contract deployment succeeded but no contract address was returned.");
  }
  return { txHash, contractAddress, receipt };
}

export async function deployFactoryIfNeeded() {
  if (config.FACTORY_CONTRACT_ADDRESS) {
    return {
      txHash: "",
      contractAddress: config.FACTORY_CONTRACT_ADDRESS,
      reused: true
    };
  }
  return deployContractFromCode(
    readContract("contracts/factory/genfren_factory.py"),
    [config.BRADBURY_TREASURY_ADDRESS]
  );
}

export async function deployPrimaryAgent(args: {
  ownerAddress: string;
  factoryAddress: string;
  name: string;
  archetype: string;
  systemPrompt: string;
}) {
  return deployContractFromCode(readContract("contracts/agent/genfren_agent.py"), [
    args.ownerAddress,
    args.factoryAddress,
    args.name,
    args.archetype,
    args.systemPrompt
  ]);
}

export async function authorizePaymentOnFactory(factoryAddress: string, txHash: string, beneficiary: string) {
  const client = studioClient();
  return client.writeContract({
    address: factoryAddress as `0x${string}`,
    functionName: "authorize_payment",
    args: [txHash, beneficiary],
    value: 0n
  });
}

export async function registerPrimaryAgentOnFactory(args: {
  factoryAddress: string;
  beneficiary: string;
  paymentTxHash: string;
  archetype: string;
  contractAddress: string;
}) {
  const client = studioClient();
  return client.writeContract({
    address: args.factoryAddress as `0x${string}`,
    functionName: "create_agent_for",
    args: [args.beneficiary, args.paymentTxHash, args.archetype, args.contractAddress],
    value: 0n
  });
}

export async function reasonWithAgent(args: {
  contractAddress: string;
  goalContext: string;
  memoryContext: string;
  evidenceJson: string;
  userMessage: string;
}) {
  const client = studioClient();
  return client.readContract({
    address: args.contractAddress as `0x${string}`,
    functionName: "reason",
    args: [args.goalContext, args.memoryContext, args.evidenceJson, args.userMessage],
    jsonSafeReturn: true
  });
}

export async function verifyBradburyTransfer(txHash: string, expectedSender: string) {
  const publicClient = createPublicClient({
    chain: {
      id: 4221,
      name: "GenLayer Bradbury Testnet",
      nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
      rpcUrls: {
        default: { http: [config.BRADBURY_RPC_URL] }
      }
    },
    transport: http(config.BRADBURY_RPC_URL)
  });
  const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

  const acceptedValue = parseEther("10");
  const valueMatch = tx.value >= acceptedValue;
  const toMatch = tx.to?.toLowerCase() === config.BRADBURY_TREASURY_ADDRESS.toLowerCase();
  const fromMatch = tx.from.toLowerCase() === expectedSender.toLowerCase();
  const confirmed = receipt.status === "success" && valueMatch && toMatch && fromMatch;

  return {
    confirmed,
    senderAddress: tx.from,
    rejectionReason: confirmed
      ? ""
      : !fromMatch
        ? "Sender address did not match the embedded wallet."
        : !toMatch
          ? "Treasury wallet did not match the configured destination."
          : !valueMatch
            ? "Transferred amount was lower than the required 10 GEN."
            : "Transaction did not finalize successfully."
  };
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}
