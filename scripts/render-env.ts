import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const envSource = existsSync(path.resolve(process.cwd(), "../buildenv/.env"))
  ? path.resolve(process.cwd(), "../buildenv/.env")
  : existsSync(path.resolve(process.cwd(), "buildenv/.env"))
    ? path.resolve(process.cwd(), "buildenv/.env")
  : existsSync(path.resolve(process.cwd(), ".env.test"))
    ? path.resolve(process.cwd(), ".env.test")
    : path.resolve(process.cwd(), ".env");
const src = readFileSync(envSource, "utf8");
const values = new Map<string, string>();

for (const rawLine of src.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const [key, ...rest] = line.split("=");
  values.set(key.trim(), rest.join("=").trim());
}

const vpsRaw = values.get("vps") ?? values.get("VPS ip") ?? "localhost";
const vpsIp = vpsRaw.replace(/^root@/i, "").trim();
const privateKey = values.get("private key") ?? values.get("PrivateKey") ?? "";
const adminAddresses = (values.get("admin address") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const treasuryCandidate =
  values.get("Treasurywallet") ??
  values.get("Treasury") ??
  values.get("treasury") ??
  adminAddresses[0] ??
  "";
const treasuryWallet =
  /^0x[a-fA-F0-9]{40}$/.test(treasuryCandidate)
    ? treasuryCandidate
    : adminAddresses.find((value) => /^0x[a-fA-F0-9]{40}$/.test(value)) ?? "";
const webUrl = `http://${vpsIp}:4100`;
const apiUrl = `http://${vpsIp}:4101`;
const renderApiUrl = "https://genfren-api-standby.onrender.com";

const env = [
  "NODE_ENV=production",
  "PORT=4000",
  `JWT_SECRET=genfren-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  "DATABASE_URL=postgres://genfren:genfren@postgres:5432/genfren",
  "REDIS_URL=redis://redis:6379",
  `BRADBURY_TREASURY_ADDRESS=${treasuryWallet}`,
  `PLATFORM_PRIVATE_KEY=${privateKey}`,
  "BRADBURY_RPC_URL=https://rpc-bradbury.genlayer.com",
  "STUDIONET_RPC_URL=https://studio.genlayer.com/api",
  "FACTORY_CONTRACT_ADDRESS=",
  `FRONTEND_URL=${webUrl}`,
  `NEXT_PUBLIC_API_URL=${apiUrl}`,
  `PRIMARY_API_URL=${apiUrl}`,
  `FALLBACK_API_URL=${renderApiUrl}`,
  "API_FAILOVER_TIMEOUT_MS=4000",
  "API_FAILOVER_COOLDOWN_MS=30000",
  `NEXT_PUBLIC_BRADBURY_TREASURY_ADDRESS=${treasuryWallet}`,
  "NEXT_PUBLIC_BRADBURY_RPC_URL=https://rpc-bradbury.genlayer.com",
  "NEXT_PUBLIC_STUDIONET_RPC_URL=https://studio.genlayer.com/api",
  "WEB_PORT=4100",
  "API_PORT=4101"
].join("\n");

writeFileSync(path.resolve(process.cwd(), ".env"), `${env}\n`);
console.log(`Rendered .env for deployment from ${envSource}`);
