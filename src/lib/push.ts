import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "./prisma";

/**
 * Notifications push, hors application.
 *
 * Les notifications in-app (`lib/notifications.ts`) ne parviennent au technicien
 * que s'il ouvre l'application. Or une intervention assignée doit prévenir
 * celui qui est en tournée, application fermée : c'est tout l'intérêt du push.
 * Firebase Cloud Messaging est le seul mécanisme qui traverse le système
 * Android sans maintenir de connexion, l'OS répétant au besoin la demande
 * d'envoi jusqu'au retour du réseau.
 *
 * Firebase est facultatif. Sans identifiants serveurs, `notifyPush` se laisse
 * tomber dans le silence et le service continue de fonctionner en notification
 * interne : une erreur de configuration ne doit pas rendre la plateforme
 * inutilisable.
 */

let initializationFailed = false;

type FirebaseServiceAccountJson = {
  project_id?: string;
  client_email: string;
  private_key: string;
};

/** Secret normalisé, aux noms attendus par le SDK Firebase. */
type FirebaseCredentials = {
  projectId: string | undefined;
  clientEmail: string;
  privateKey: string;
};

/**
 * Lit le secret de service.
 *
 * Les secrets de projet sont souvent collés tels quels dans les variables
 * d'environnement ; le JSON brut est donc accepté, tout comme sa version
 * encodée en base64, que certaines consoles de secrets produisent.
 */
function readServiceAccount(): FirebaseCredentials | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();

  if (!raw) {
    return null;
  }

  const candidates = [raw];

  if (!raw.startsWith("{")) {
    candidates.push(Buffer.from(raw, "base64").toString("utf8"));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as FirebaseServiceAccountJson;

      if (parsed.private_key && parsed.client_email) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          // La clé est recopiée depuis la console, où les retours à la ligne
          // apparaissent souvent comme la séquence littérale `\n`.
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch {
      // Essai suivant.
    }
  }

  return null;
}

function getMessagingClient() {
  if (initializationFailed) {
    return null;
  }

  const serviceAccount = readServiceAccount();

  if (!serviceAccount) {
    initializationFailed = true;
    console.warn(
      "FIREBASE_SERVICE_ACCOUNT absent ou illisible : les notifications push sont désactivées."
    );
    return null;
  }

  try {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(serviceAccount),
      });
    }

    return getMessaging();
  } catch (error) {
    initializationFailed = true;
    console.error("Initialisation Firebase impossible :", error);
    return null;
  }
}

type PushPayload = {
  title: string;
  body: string;
  ticketId?: string;
};

/**
 * Envoie une notification à tous les appareils d'un destinataire.
 *
 * Les jetons invalides sont retirés au passage : Firebase renvoie
 * `registration-token-not-registered` quand l'application a été désinstallée,
 * et conserver ce jeton ferait échouer l'envoi pour tous les autres à chaque
 * notification.
 */
export async function notifyPush(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  const messaging = getMessagingClient();

  if (!messaging) {
    return;
  }

  const targets = [...new Set(userIds)].filter(Boolean);

  if (targets.length === 0) {
    return;
  }

  try {
    const registrations = await prisma.pushToken.findMany({
      where: { userId: { in: targets } },
      select: { id: true, token: true },
    });

    if (registrations.length === 0) {
      return;
    }

    const response = await messaging.sendEachForMulticast({
      tokens: registrations.map((registration) => registration.token),
      notification: { title: payload.title, body: payload.body },
      android: {
        priority: "high",
        notification: { channelId: "wificare_notifications" },
      },
      // L'application reçoit l'identifiant de la demande et ouvre le détail
      // quand l'utilisateur tape sur la notification.
      data: payload.ticketId ? { ticketId: payload.ticketId } : undefined,
    });

    const staleIds = response.responses.flatMap((item, index) => {
      const error = item.error;

      if (!error) {
        return [];
      }

      const code = "code" in error ? String(error.code) : "";

      const invalid =
        code.includes("registration-token-not-registered") ||
        code.includes("INVALID_ARGUMENT");

      return invalid ? [registrations[index].id] : [];
    });

    if (staleIds.length > 0) {
      await prisma.pushToken.deleteMany({ where: { id: { in: staleIds } } });
    }

    if (response.failureCount > 0) {
      console.warn(
        `Push : ${response.failureCount} envoi(s) en échec sur ${registrations.length}.`
      );
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
}
