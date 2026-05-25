"use client";

import { createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

import { getApiBase } from "./api";

const VAULT_KEY = "genfren-vault";

export interface StoredVault {
  walletAddress: string;
  encryptedPrivateKey: string;
  encryptedPrivateKeyNonce: string;
  vaultSalt: string;
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt.buffer as ArrayBuffer,
      iterations: 100_000
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function createVault(password: string) {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(privateKey)
  );
  const vault = {
    walletAddress: account.address,
    encryptedPrivateKey: toBase64(new Uint8Array(ciphertext)),
    encryptedPrivateKeyNonce: toBase64(nonce),
    vaultSalt: toBase64(salt)
  };
  saveVault(vault);
  return vault;
}

export function saveVault(vault: StoredVault) {
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

export function loadVault() {
  const raw = localStorage.getItem(VAULT_KEY);
  return raw ? (JSON.parse(raw) as StoredVault) : null;
}

export async function decryptVault(password: string, vault = loadVault()) {
  if (!vault) throw new Error("No local vault found.");
  const key = await deriveKey(password, fromBase64(vault.vaultSalt));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(vault.encryptedPrivateKeyNonce).buffer as ArrayBuffer },
    key,
    fromBase64(vault.encryptedPrivateKey)
  );
  return new TextDecoder().decode(plaintext) as `0x${string}`;
}

export async function sendCreationPayment(password: string) {
  const privateKey = await decryptVault(password);
  const account = privateKeyToAccount(privateKey);
  const rpcUrl = process.env.NEXT_PUBLIC_BRADBURY_RPC_URL ?? "https://rpc-bradbury.genlayer.com";
  const chain = {
    id: 4221,
    name: "GenLayer Bradbury Testnet",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] }
    }
  } as const;

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
  const balance = await publicClient.getBalance({ address: account.address });
  const requiredAmount = parseEther("10");
  if (balance < requiredAmount) {
    throw new Error(
      `This vault has ${Number(formatEther(balance)).toFixed(4)} GEN. Fund ${account.address} with at least 10 GEN on Bradbury, then try again or paste the payment transaction hash below.`
    );
  }

  const client = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl)
  });
  try {
    return await client.sendTransaction({
      account,
      to: (process.env.NEXT_PUBLIC_BRADBURY_TREASURY_ADDRESS ??
        "0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E") as `0x${string}`,
      value: requiredAmount
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Activation payment failed.";
    if (message.includes("LackOfFundForMaxFee") || message.toLowerCase().includes("lackoffund") || message.toLowerCase().includes("insufficient")) {
      throw new Error(
        `The vault does not have enough GEN to approve activation. Fund ${account.address} on Bradbury with 10 GEN plus gas, or send 10 GEN manually to the treasury and paste the transaction hash.`
      );
    }
    throw new Error("Activation payment could not be submitted. You can still send 10 GEN manually to the treasury and paste the transaction hash.");
  }
}

export async function deploySubagentWithUserKey(args: {
  password: string;
  primaryAgentAddress: string;
  name: string;
  archetype: string;
  role: string;
}) {
  const privateKey = await decryptVault(args.password);
  const account = privateKeyToAccount(privateKey);
  const codeResponse = await fetch(`${getApiBase()}/contracts/subagent-code`);
  const { code } = await codeResponse.json() as { code: string };
  const chain = process.env.NEXT_PUBLIC_STUDIONET_RPC_URL
    ? {
        ...studionet,
        rpcUrls: {
          ...studionet.rpcUrls,
          default: { http: [process.env.NEXT_PUBLIC_STUDIONET_RPC_URL] }
        }
      }
    : studionet;
  const client = createClient({
    chain,
    account
  });

  const deployTxHash = await client.deployContract({
    code,
    args: [
      args.primaryAgentAddress,
      args.name,
      args.archetype,
      args.role,
      4,
      true,
      false,
      "official-docs,company-sites,public-apis"
    ]
  });
  const deploymentReceipt = await client.waitForTransactionReceipt({
    hash: deployTxHash as any,
    status: TransactionStatus.ACCEPTED,
    retries: 60,
    interval: 5000
  });
  const deploymentData = deploymentReceipt as Record<string, any>;
  const contractAddress = deploymentData.data?.contract_address ?? deploymentData.txDataDecoded?.contractAddress;
  if (!contractAddress) {
    throw new Error("Subagent deployment did not return a contract address.");
  }

  const registerTxHash = await client.writeContract({
    address: args.primaryAgentAddress as `0x${string}`,
    functionName: "register_subagent",
    args: [`sub_${Date.now()}`, contractAddress],
    value: 0n
  });

  return {
    contractAddress,
    deploymentTxHash: deployTxHash,
    registerTxHash
  };
}
