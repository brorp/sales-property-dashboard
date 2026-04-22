import { config } from "dotenv";
config({ path: "./apps/server/.env" });
import { db } from "./apps/server/src/db/index";
import { client } from "./apps/server/src/db/schema";
async function run() {
  const c = await db.select().from(client);
  console.log(c);
  process.exit(0);
}
run();
