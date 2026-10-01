'use client';

import { useCallback, useEffect, useState } from 'react';

import { registerWebPushAction, unregisterWebPushAction } from './push-actions';

/** Clé publique VAPID, exposée au navigateur : elle n'a rien de secret. */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/** Service worker qui reçoit les notifications hors application. */
const WORKER_URL = '/push-worker.js';

/**
 * Convertit la clé VAPID en format accepté par `PushManager`.
 *
 * L'abonnement prend une clé binaire, pas du base64 : `applicationServerKey`
 * attend un tampon, faute de quoi l'abonnement est refusé. Le tampon est
 * renvoyé en `ArrayBuffer` — un `Uint8Array` construit sur un tampon générique
 * est rejeté par le typage de `applicationServerKey`.
 */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);

  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < raw.length; index++) {
    bytes[index] = raw.charCodeAt(index);
  }

  return buffer;
}

/** Nom lisible du poste, pour que la régie sache quel navigateur est abonné. */
function deviceLabel(): string {
  const browser =
    /Edg\//.test(navigator.userAgent) ? 'Edge'
    : /OPR\//.test(navigator.userAgent) ? 'Opera'
    : /Firefox\//.test(navigator.userAgent) ? 'Firefox'
    : /Chrome\//.test(navigator.userAgent) ? 'Chrome'
    : 'Navigateur';

  const os =
    /Windows/.test(navigator.userAgent) ? 'Windows'
    : /Android/.test(navigator.userAgent) ? 'Android'
    : /iPhone|iPad/.test(navigator.userAgent) ? 'iOS'
    : /Mac/.test(navigator.userAgent) ? 'macOS'
    : /Linux/.test(navigator.userAgent) ? 'Linux'
    : '';

  return os ? `${browser} sur ${os}` : browser;
}

export type PushState =
  /** Lecture en cours : le navigateur n'a pas encore répondu. */
  | 'loading'
  | 'unsupported'
  | 'disabled'
  | 'prompt'
  | 'denied'
  /** Abonnement actif : le poste reçoit les notifications. */
  | 'subscribed';

/**
 * État du canal push pour le navigateur courant.
 *
 * L'autorisation et l'abonnement sont deux choses distinctes : un navigateur
 * peut avoir la permission accordée sans abonnement — parce que la régie
 * l'a retirée depuis un autre poste, ou parce qu'elle a été accordée avant que
 * le canal existe. Confundre les deux affichait « Désactiver » sur un poste qui
 * ne recevrait rien, et ne proposait aucun moyen de s'abonner : il fallait
 * passer par les réglages du navigateur pour débloquer la situation.
 *
 * La lecture de l'abonnement est donc asynchrone : l'état `prompt` couvre
 * « non abonné, autorisation demandable ».
 */
export async function currentPushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }

  if (!VAPID_PUBLIC_KEY) return 'disabled';
  if (Notification.permission === 'denied') return 'denied';

  const subscription = await existingSubscription();

  return subscription ? 'subscribed' : 'prompt';
}

/** Abonnement déjà présent sur ce poste, s'il y en a un. */
async function existingSubscription(): Promise<PushSubscription | null> {
  try {
    const registration = await navigator.serviceWorker.getRegistration(WORKER_URL);

    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    // Un service worker absent ou en erreur ne doit pas empêcher l'écran de
    // s'afficher : l'activation saura dire ce qui ne va pas.
    return null;
  }
}

/**
 * Abonnement du navigateur aux notifications du back-office.
 *
 * Le service worker doit être enregistré avant l'abonnement : c'est lui qui
 * reçoit et affiche la notification ensuite, onglet fermé compris.
 */
export async function enableWebPush(): Promise<{ ok: boolean; error?: string }> {
  const registration = await navigator.serviceWorker.register(WORKER_URL, { scope: '/' });

  // `ready` ne se résout qu'une fois le worker actif : s'abonner avant
  // produirait un abonnement que personne ne recevrait.
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    return {
      ok: false,
      error:
        permission === 'denied'
          ? 'Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur, puis rechargez la page.'
          : 'Autorisation refusée.',
    };
  }

  const existing = await existingSubscription();

  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY),
    }));

  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  const result = await registerWebPushAction({
    endpoint: json.endpoint ?? '',
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    label: deviceLabel(),
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true };
}

/** Retire l'abonnement du navigateur, sans toucher à l'autorisation système. */
export async function disableWebPush(): Promise<{ ok: boolean; error?: string }> {
  const subscription = await existingSubscription();

  if (subscription) {
    await unregisterWebPushAction(subscription.endpoint);
    await subscription.unsubscribe();
  }

  return { ok: true };
}

/**
 * Veille sur l'état du canal push et le renvoie à l'écran de réglages.
 *
 * L'autorisation peut être modifiée dans les réglages du navigateur sans que la
 * page en soit informée : le retour sur l'onglet relit donc l'état, sans quoi
 * l'écran proposerait de nouveau une activation déjà faite, ou joindrait une
 * autorisation refusée.
 */
export function usePushState(): PushState {
  // L'état dépend de l'abonnement, que le navigateur ne livre qu'en asynchrone :
  // il est donc relu après le premier rendu. L'écran affiche « Chargement » à
  // cet instant, ce qui évite de proposer une activation sur un poste déjà
  // abonné — ou l'inverse.
  const [state, setState] = useState<PushState>('loading');

  const refresh = useCallback(async () => {
    setState(await currentPushState());
  }, []);

  useEffect(() => {
    // La première lecture est asynchrone : elle est donc différée d'un tour de
    // boucle, pour que l'effet n'écrive pas dans l'état pendant le rendu.
    const timer = window.setTimeout(refresh, 0);

    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return state;
}