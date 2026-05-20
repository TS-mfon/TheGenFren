import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(8).default("genfren-dev-secret"),
  DATABASE_URL: z.string().default("postgres://genfren:genfren@localhost:5432/genfren"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SERVICE_NAME: z.string().default("genfren-api"),
  SERVICE_ROLE: z.enum(["primary", "standby", "local"]).default("local"),
  BRADBURY_TREASURY_ADDRESS: z.string().default("0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E"),
  PLATFORM_PRIVATE_KEY: z.string().default(""),
  STUDIONET_RPC_URL: z.string().optional(),
  BRADBURY_RPC_URL: z.string().default("https://rpc-bradbury.genlayer.com"),
  FACTORY_CONTRACT_ADDRESS: z.string().default(""),
  FRONTEND_URL: z.string().default("http://localhost:3000")
});

export const config = envSchema.parse(process.env);
