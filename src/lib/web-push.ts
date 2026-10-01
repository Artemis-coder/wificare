import webpush from "web-push";

import { prisma } from "./prisma";

/**
 * Notifications push vers les navigateurs du back-office.
 *
 * Complémentaire de `lib/push.ts`, qui passe par Firebase Cloud Messaging pour
 * l'application Android. Les deux canaux coexistent parce qu'ils ne s'adressent
 * pas au même matériel : un jeton FCM ne fonctionne que dans l'application, un
 * abonnement Web Push que dans un navigateur.
 *
 * Le transport retenu côté web est Web Push (VAPID) plutôt que Firebase Web :
 * ce dernier exige d'enregistrer une application Web dans la console Firebase
 * et d'y générer un certificat de notification. La paire de clés se génère
 * localement, sans compte ni console externe, ce qui évite d'exposer la
 * plateforme à une dépendance administrative pour une notification.
 *
 * Comme pour Firebase, l'envoi ne fait jamais échouer l'opération métier qui
 * l'appelle : une notification perdue ne doit pas perdre une demande.
 */

/** Clés VAPID lues de l'environnement. */
type VapidKeys = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

let configured = false;

function getVapidKeys(): VapidKeys | null {
  if (configured) return null;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();

  if (!publicKey || !privateKey) {
    configured = true;
    console.warn(
      "Clés VAPID absentes : les notifications push vers les navigateurs sont désactivées."
    );
    return null;
  }

  // La clé publique sert à l'abonnement côté navigateur ; le serveur n'en a pas
  // besoin, et la conserver ici ferait croire qu'elle est secrète.
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:support@wificare.ci",
    publicKey,
    privateKey
  );

  configured = true;

  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "" };
}

/** Les clés sont-elles présentes ? Permet à l'interface de le dire. */
export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim()
  );
}

type PushPayload = {
  title: string;
  body: string;
  ticketId?: string;
};

/**
 * Envoie une notification aux navigateurs abonnés d'un destinataire.
 *
 * Les abonnements expirés sont retirés au passage : le service de push répond
 * `404` ou `410` pour une adresse qui n'existe plus, typiquement un navigateur
 * désabonné ou un poste réinstallé. Sans ce nettoyage, chaque notification
 * échouerait pour tout le monde à cause d'un abonnement fantôme.
 */
export async function notifyWebPush(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  if (!isWebPushConfigured()) {
    return;
  }

  const targets = [...new Set(userIds)].filter(Boolean);

  if (targets.length === 0) {
    return;
  }

  try {
    getVapidKeys();

    const subscriptions = await prisma.webPushSubscription.findMany({
      where: { userId: { in: targets } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) {
      return;
    }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      ticketId: payload.ticketId ?? null,
    });

    const results = await Promise.allSettled(
      subscriptions.map((subscription) =>
        webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          { TTL: 60 * 60, urgency: "high" }
        )
      )
    );

    const expired = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return [];

      const statusCode = (result.reason as { statusCode?: number })?.statusCode;

      return statusCode === 404 || statusCode === 410
        ? [subscriptions[index].id]
        : [];
    });

    if (expired.length > 0) {
      await prisma.webPushSubscription.deleteMany({ where: { id: { in: expired } } });
    }

    const failed = results.filter((result) => result.status === "rejected").length;

    if (failed > 0) {
      console.warn(
        `Push web : ${failed} envoi(s) en échec sur ${subscriptions.length}.`
      );
    }
  } catch (error) {
    console.error("Push web error:", error);
  }
}