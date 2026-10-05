import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
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
  /**
   * Charge utile additionnelle, à lire par l'application au retour sur la
   * notification.
   *
   * `ticketId` seul ne suffit pas à tout : une demande proposée à un technicien
   * n'est pas encore la sienne, et ouvrir son détail lui renverrait un refus —
   * l'API ne lui laisse pas lire une demande qui ne lui est pas affectée. Il lui
   * faut l'identifiant de la proposition, qu'il n'a pas à deviner. Ce champ
   * porte ce genre de clé supplémentaire, sans multiplier les canaux pour un
   * même événement.
   */
  extraData?: Record<string, string>;
};

/**
 * Vrai si le serveur peut réellement envoyer.
 *
 * À lire par la console de notification : sans cette information, une campagne
 * envoyée quand Firebase n'est pas configuré se termine par un message
 * enregistré, et rien n'indique à la régie qu'aucun téléphone n'a été touché.
 */
export function isPushConfigured(): boolean {
  return readServiceAccount() !== null;
}

/**
 * Destinataires disposant d'au moins un téléphone abonné.
 *
 * Un compte actif peut n'avoir jamais ouvert l'application depuis l'installation
 * du push, ou refuser les notifications : il verrait le message en l'ouvrant,
 * mais ne le recevrait pas en dehors. Compter ces comptes à part permet de le
 * dire avant l'envoi plutôt que de le découvrir après.
 */
export async function devicesSubscribedFor(userIds: string[]): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }

  const rows = await prisma.pushToken.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true },
    distinct: ["userId"],
  });

  return rows.length;
}

/**
 * Envoie un message FCM à tous les appareils d'une liste de destinataires.
 *
 * La sélection des jetons et le retrait des jetons périmés ne dépendent que des
 * comptes visés, pas du contenu du message : le travail commun est factorisé
 * ici, et chaque canal ne compose que son message. C'est ce qui permet à
 * `notifyTrackingUpdate` de partir en données seules sans réécrire — et sans
 * faire diverger — la gestion des erreurs déjà éprouvée par les notifications.
 *
 * Ne lève jamais : un push perdu ne doit pas faire échouer l'appel métier.
 */
async function sendToDevices(
  userIds: string[],
  buildMessage: (tokens: string[]) => MulticastMessage
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

    const response = await messaging.sendEachForMulticast(
      buildMessage(registrations.map((registration) => registration.token))
    );

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
  const data: Record<string, string> = {
    ...(payload.extraData ?? {}),
    ...(payload.ticketId ? { ticketId: payload.ticketId } : {}),
  };

  await sendToDevices(userIds, (tokens) => ({
    tokens,
    notification: { title: payload.title, body: payload.body },
    android: {
      priority: "high",
      notification: { channelId: "wificare_notifications" },
    },
    // L'application reçoit l'identifiant de la demande et ouvre le détail
    // quand l'utilisateur tape sur la notification. Les clés additionnelles
    // éventuelles viennent avant : `ticketId` reste la valeur de référence, et
    // une clé du même nom fournie par erreur ne doit pas l'écraser.
    data: Object.keys(data).length > 0 ? data : undefined,
  }));
}

/** État de suivi à transmettre au client d'une demande. */
export type TrackingUpdatePayload = {
  ticketId: string;
  reference: string;
  etaMinutes: number | null;
  distanceMeters: number | null;
};

/**
 * Informe le client d'une mise à jour du suivi de position du technicien.
 *
 * Volontairement un message FCM *données seules*, sans bloc `notification` :
 * l'application dessine elle-même sa notification, pour tenir un compte à rebours
 * qui se met à jour minute après minute. Un bloc `notification` ferait qu'Android
 * affiche en plus une bannière système figée sur la valeur reçue — doublon
 * analogue à celui déjà corrigé sur le canal métier, qu'il ne faut pas
 * réintroduire ici.
 *
 * La priorité reste à `high` : c'est elle qui fait livrer le message à
 * l'application en tâche de fond, donc sans attendre qu'elle soit ouverte, et
 * c'est ce qui permet à l'ETA de rester fraîche. FCM n'accepte que des chaînes
 * en charge utile : une valeur absente part vide, ce que l'application distingue
 * d'un zéro.
 *
 * Ne lève jamais : le suivi est rafraîchi à haute fréquence, une erreur sur un
 * point ne doit pas interrompre l'enregistrement des suivants.
 */
export async function notifyTrackingUpdate(
  userIds: string[],
  payload: TrackingUpdatePayload
): Promise<void> {
  try {
    await sendToDevices(userIds, (tokens) => ({
      tokens,
      // Discriminant lu par l'application : elle reconnaît le suivi et
      // n'affiche que sa propre notification.
      data: {
        type: "TRACKING_UPDATE",
        ticketId: payload.ticketId,
        reference: payload.reference,
        etaMinutes: payload.etaMinutes === null ? "" : String(payload.etaMinutes),
        distanceMeters:
          payload.distanceMeters === null ? "" : String(payload.distanceMeters),
      },
      android: {
        priority: "high",
      },
    }));
  } catch (error) {
    console.error("Tracking update push error:", error);
  }
}

/**
 * Demande de réactivation du suivi de position adressée au technicien.
 */
export type TrackingNudgePayload = {
  ticketId: string;
  reference: string;
};

/**
 * Informe au technicien de la suite donnée à sa demande.
 *
 * Émis en données seules, comme le suivi lui-même : c'est l'application qui
 * décide de ce qu'elle montre, et un bloc `notification` ferait apparaître en
 * plus une bannière système figée, doublon de l'écran que le technicien vient
 * d'ouvrir.
 *
 * Partage volontairement `sendToDevices` et donc `getMessagingClient` avec les
 * autres canaux : une seconde initialisation Firebase créerait un second client
 * de messagerie, donc une seconde file d'envoi, sur le même projet.
 *
 * Ne lève jamais, et l'absence de jeton n'est pas distinguée comme un échec :
 * le technicien peut simplement avoir désinstallé l'application, ce qui ne dit
 * rien de l'état de la demande et ne doit pas faire échouer l'appel du client.
 */
export async function notifyTrackingNudge(
  userIds: string[],
  payload: TrackingNudgePayload
): Promise<void> {
  try {
    await sendToDevices(userIds, (tokens) => ({
      tokens,
      // Discriminant lu par l'application pour ouvrir la demande concernée.
      data: {
        type: "TRACKING_NUDGE",
        ticketId: payload.ticketId,
        reference: payload.reference,
      },
      android: {
        priority: "high",
      },
    }));
  } catch (error) {
    console.error("Tracking nudge push error:", error);
  }
}
