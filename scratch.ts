import { config } from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

// Smart CWD resolution: ensure we end up in apps/server
let serverDir = process.cwd();
if (!serverDir.endsWith("apps/server")) {
  serverDir = path.resolve(serverDir, "apps/server");
}
process.chdir(serverDir);

config({ path: "./.env" });

import { db } from "./apps/server/src/db/index";
import { fcmToken } from "./apps/server/src/db/schema";

async function run() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set in .env!");
    process.exit(1);
  }

  let serviceAccount: any;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    serviceAccount = JSON.parse(trimmed);
  } else {
    const resolvedPath = path.resolve(process.cwd(), trimmed);
    const fileContent = fs.readFileSync(resolvedPath, "utf8");
    serviceAccount = JSON.parse(fileContent);
  }

  console.log("Initializing Firebase Admin with project:", serviceAccount.project_id);
  initializeApp({ credential: cert(serviceAccount) });
  const messaging = getMessaging();

  console.log("Querying tokens from DB...");
  const allTokens = await db.select().from(fcmToken);
  
  if (allTokens.length === 0) {
    console.log("No tokens in DB.");
    process.exit(0);
  }

  console.log(`Found ${allTokens.length} tokens. Sending test messages...`);
  
  const messages = allTokens.map((row) => ({
    token: row.token,
    notification: {
      title: "Test Manual Notifikasi",
      body: "Ini adalah notifikasi uji coba dari scratch.ts!",
    },
    webpush: {
      notification: {
        title: "Test Manual Notifikasi",
        body: "Ini adalah notifikasi uji coba dari scratch.ts!",
      },
    },
  }));

  try {
    const response = await messaging.sendEach(messages);
    console.log("\n--- FCM RESPONSE SUMMARY ---");
    console.log(`Success count: ${response.successCount}`);
    console.log(`Failure count: ${response.failureCount}`);
    
    response.responses.forEach((res, index) => {
      const token = allTokens[index].token;
      const userId = allTokens[index].userId;
      if (res.success) {
        console.log(`[Success] User: ${userId} | MessageId: ${res.messageId}`);
      } else {
        console.log(`\x1b[31m[Failure]\x1b[0m User: ${userId}`);
        console.log(`  Token: ${token.substring(0, 30)}...`);
        console.log(`  Error Code: ${res.error?.code}`);
        console.log(`  Error Message: ${res.error?.message}`);
      }
    });
  } catch (error: any) {
    console.error("FCM Send Error:", error);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});





