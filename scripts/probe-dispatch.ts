/**
 * Vérifie l'invariant de la circulation, de bout en bout, contre l'API locale.
 *
 * L'invariant : **une demande prise ne revient plus à personne**, et une demande
 * rendue dans la file redevienne disponible.
 *
 * La lecture du code ne permet pas de trancher : une proposition refermée par la
 * prise disparaît-elle vraiment de la file du technicien, et le garde-fou tient-il
 * sans dépendre du délai de redistribution ? Seul l'appel réel répond.
 *
 * Un technicien de passage est créé, puis supprimé : le compte du technicien
 * existant n'est pas touché, et son mot de passe n'a pas à être connu.
 */
import { randomBytes, scryptSync } from "crypto";

import { prisma } from "../src/lib/prisma";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3111/api";
const CLIENT_PHONE = process.env.PROBE_CLIENT_PHONE ?? "+2250101010101";
const PASSWORD = "1234";

let failed = false;

function check(label: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "OK   " : "ECHEC"} ${label}${detail ? ` — ${detail}` : ""}`);

  if (!condition) {
    failed = true;
  }
}

/** Corps JSON, tel que renvoyé par l'API. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type ApiResponse = {
  status: number;
  /** Enveloppe `{ data }` de l'API. La forme de `data` dépend de la route. */
  payload: { data?: Json; error?: string };
};

/** Proposition lue dans la file du technicien. */
type Offer = {
  id: string;
  ticket: { id: string; reference: string };
};

/** Demande renvoyée par l'API, telle que la lit le script. */
type Ticket = {
  id: string;
  reference: string;
  status: string;
  technicianId: string | null;
};

function asArray(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: Json | undefined): { [key: string]: Json } {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as { [key: string]: Json })
    : {};
}

async function call(
  method: string,
  path: string,
  token?: string,
  body?: unknown
): Promise<ApiResponse> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    status: response.status,
    payload: await response.json().catch(() => ({} as { data?: Json })),
  };
}

async function login(phone: string): Promise<string> {
  const { status, payload } = await call("POST", "/auth/login", undefined, {
    phone,
    password: PASSWORD,
  });

  if (status !== 200) {
    throw new Error(`connexion ${phone} : HTTP ${status}`);
  }

  const token = asRecord(asRecord(payload.data).tokens).accessToken;

  if (typeof token !== "string") {
    throw new Error(`connexion ${phone} : jeton absent de la réponse`);
  }

  return token;
}

async function proposals(token: string, ticketId: string): Promise<Offer[]> {
  const { payload } = await call("GET", "/technicians/offers", token);

  return asArray(asRecord(payload.data).items)
    .map((item) => asRecord(item) as unknown as Offer)
    .filter((offer) => asRecord(offer.ticket).id === ticketId);
}

/**
 * La boucle de répartition est portée par le trafic des applications : c'est la
 * lecture du technicien qui la fait tourner. Deux lectures suffisent à franchir
 * une expiration.
 */
async function waitForProposal(token: string, ticketId: string): Promise<number> {
  let found = 0;

  for (let attempt = 0; attempt < 3 && found === 0; attempt++) {
    found = (await proposals(token, ticketId)).length;
  }

  return found;
}

async function main(): Promise<void> {
  const salt = randomBytes(16).toString("hex");
  const phone = `22599${String(Date.now()).slice(-7)}`;

  const technician = await prisma.user.create({
    data: {
      phone,
      name: "Technicien de vérification",
      role: "TECHNICIAN",
      status: "ACTIVE",
      passwordHash: `${salt}:${scryptSync(PASSWORD, salt, 32).toString("hex")}`,
      isOnline: true,
      onlineSince: new Date(),
      lastSeenAt: new Date(),
    },
    select: { id: true, phone: true },
  });

  console.log(`technicien de passage -> ${technician.phone}`);

  let ticketId: string | null = null;

  try {
    const client = await login(CLIENT_PHONE);
    const tech = await login(`+${phone}`);

    const zones = await call("GET", "/wifi-zones", client);
    const zone = asArray(zones.payload.data).find(
      (candidate) => asRecord(candidate).status === "ACTIVE"
    );

    if (!zone) {
      throw new Error("aucune zone active sur le compte client");
    }

    const created = await call(
      "POST",
      "/tickets",
      client,
      {
        wifiZoneId: asRecord(zone).id,
        type: "Panne totale",
        description: "verification circulation",
      }
    );

    const newTicket: Ticket = asRecord(created.payload.data) as unknown as Ticket;
    const newTicketId = newTicket.id;
    ticketId = newTicketId;
    console.log(`demande creee        -> ${newTicket.reference}`);

    check(
      "la demande entre dans le circuit",
      (await waitForProposal(tech, newTicketId)) > 0
    );

    const mine = (await proposals(tech, newTicketId))[0];
    const accepted = await call("POST", `/offers/${mine.id}/accept`, tech);

    check("la prise aboutit", accepted.status === 200, `HTTP ${accepted.status}`);

    const detail = await call("GET", `/tickets/${newTicketId}`, tech);
    const attributed: Ticket = asRecord(detail.payload.data) as unknown as Ticket;

    check(
      "la demande lui est attribuee",
      attributed.technicianId === technician.id,
      attributed.status
    );

    // Trois lectures : le garde-fou doit tenir par lui-même, sans dépendre du
    // délai de redistribution.
    let remaining = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      remaining = (await proposals(tech, newTicketId)).length;
    }

    check("la demande prise ne revient plus", remaining === 0, `${remaining} proposition(s)`);

    // La remise est le seul cas où une demande prise redevient disponible.
    const released = await call("POST", `/tickets/${newTicketId}/release`, tech);
    check("la remise aboutit", released.status === 200, `HTTP ${released.status}`);

    // La réponse de la remise fait foi, pas une relecture : après la remise le
    // technicien n'a plus le droit de lire la demande — il ne l'a plus. Lire
    // `technicianId` sur une relecture échouerait à juste titre, en 403.
    const releasedTicket: Ticket = asRecord(released.payload.data) as unknown as Ticket;

    check(
      "la remise rend la demande au circuit",
      releasedTicket.technicianId === null,
      releasedTicket.status
    );

    const forbidden = await call("GET", `/tickets/${newTicketId}`, tech);
    check(
      "la demande n'est plus lisible par celui qui l'a rendue",
      forbidden.status === 403,
      `HTTP ${forbidden.status}`
    );

    check(
      "la remise la repropose",
      (await waitForProposal(tech, newTicketId)) > 0,
      "la boucle repart"
    );
  } finally {
    if (ticketId) {
      await prisma.ticket.deleteMany({ where: { id: ticketId } });
    }

    await prisma.user.deleteMany({ where: { id: technician.id } });

    console.log("nettoyage            -> demande et technicien de passage supprimes");
    await prisma.$disconnect();
  }

  if (failed) {
    console.error("\nInvariant de circulation : NON");
    process.exit(1);
  }

  console.log("\nInvariant de circulation : vérifié");
}

main().catch(async (error) => {
  console.error("ECHEC :", (error as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
