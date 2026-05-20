import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import Fastify from "fastify";

import { config } from "./config.js";
import { pool } from "./lib/db.js";
import { redis } from "./lib/redis.js";
import { registerRoutes } from "./routes/index.js";

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: true,
  credentials: true
});
await app.register(cookie);
await app.register(jwt, {
  secret: config.JWT_SECRET
});

app.setErrorHandler((error: Error, _request, reply) => {
  const message = error.message ?? "Unexpected server error.";
  const statusCode =
    message.includes("not found") ? 404 :
    message.includes("Unauthorized") ? 401 :
    message.includes("must be confirmed") || message.includes("Invalid") || message.includes("required") ? 400 :
    500;
  reply.code(statusCode).send({
    error: message
  });
});

app.addHook("onClose", async () => {
  await pool.end();
  await redis.quit();
});

await registerRoutes(app);

app.listen({ port: config.PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
