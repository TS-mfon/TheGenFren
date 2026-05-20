import "dotenv/config";

import { deployFactoryIfNeeded } from "../apps/api/src/services/genlayer.js";

async function main() {
  const result = await deployFactoryIfNeeded();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
