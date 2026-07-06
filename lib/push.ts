// Rakha's lock screen voice (doc 82 section 5c). Sends through the Expo push
// API with plain fetch, no SDK. The path is dormant until the app registers
// tokens: the expo-notifications native module ships with the next EAS
// rebuild, so the cron simply skips any user without a token until then.
// Ping priority only, the same noise caps as WhatsApp, and its own per user
// preference (reminder_prefs.agent_push).

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export function isExpoPushToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^ExponentPushToken\[.+\]$/.test(token);
}

export async function sendExpoPush(token: string, title: string, body: string): Promise<boolean> {
  if (!isExpoPushToken(token)) return false;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        // The app deep links this straight into the Puchio chat where the
        // Rakha card stream lives.
        data: { screen: 'accountant' },
      }),
    });
    if (!res.ok) return false;
    const j = (await res.json().catch(() => null)) as { data?: { status?: string } } | null;
    return j?.data?.status === 'ok';
  } catch {
    return false;
  }
}
