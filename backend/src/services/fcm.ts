import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getConfig } from "../config.js";

function getFirebaseApp(): App | null {
  if (getApps().length > 0) return getApps()[0]!;
  const cfg = getConfig();
  if (!cfg.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    const sa = JSON.parse(cfg.FIREBASE_SERVICE_ACCOUNT_JSON);
    return initializeApp({ credential: cert(sa) });
  } catch {
    console.error("[fcm] Invalid FIREBASE_SERVICE_ACCOUNT_JSON — push notifications disabled");
    return null;
  }
}

export async function sendFcmNotification(fcmToken: string, body: string): Promise<void> {
  const app = getFirebaseApp();
  if (!app) return;
  await getMessaging(app).send({
    token: fcmToken,
    notification: { title: "Gluci", body },
    android: {
      priority: "high",
      notification: { channelId: "gluci_nudges", sound: "default" },
    },
  });
}
