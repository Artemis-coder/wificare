import {
  DocumentStatus,
  MobileMoneyOperator,
  NotificationType,
  PaymentChannel,
  TicketStatus,
  type Payment,
  type QuoteInvoice,
} from "@prisma/client";

import { prisma } from "./prisma";
import { notify } from "./notifications";
import { PUBLIC_USER_SELECT } from "./user-public";
import { fail, type TicketActor, type TicketResult } from "./tickets";

/**
 * Décision et règlement d'un devis.
 *
 * Les règles vivent ici, et non dans les appelants : l'interface web appelle
 * ces fonctions par des server actions (session NextAuth), l'application mobile
 * par l'API REST (jeton Bearer). Les deux écrans offrent le même parcours, et
 * appliquent donc la même règle — sans quoi un devis accepté sur un téléphone
 * et refusé sur un navigateur produiraient deux demandes dans deux états
 * différents.
 */

export type QuoteDecision = "ACCEPT" | "REJECT";

export type PayQuoteInput = {
  channel: string;
  operator?: string;
  /** Référence Mobile Money, ou référence de virement. */
  transactionRef?: string | null;
};

const CHANNELS = new Set<string>(Object.values(PaymentChannel));
const OPERATORS = new Set<string>(Object.values(MobileMoneyOperator));

const CHANNEL_LABEL: Record<PaymentChannel, string> = {
  CASH: "espèces",
  MOBILE_MONEY: "Mobile Money",
  BANK_TRANSFER: "virement bancaire",
};

const OPERATOR_LABEL: Record<MobileMoneyOperator, string> = {
  WAVE: "Wave",
  ORANGE: "Orange",
  MTN: "MTN",
};

/**
 * Le client a-t-il autorisé qu'on intervienne ?
 *
 * `ACCEPTED` et `PAID` autorisent la réparation, `PAID` plus encore que
 * `ACCEPTED` : c'est le même accord, déjà honoré en argent. Les distinguer
 * produisait une impasse : le client pouvait régler avant que le technicien
 * n'ait fait avancer la demande, et celle-ci restait alors en `PENDING_QUOTE`
 * avec un devis payé — état que la règle de réparation refusait, faute de
 * trouver un devis « accepté ». La demande devenait impossible à faire avancer et aucun
 * écran ne proposait plus rien au technicien.
 *
 * `REJECTED` n'autorise rien : le client a écarté le montant. La demande
 * reste en réparation, où le technicien corrige son devis ou signale une
 * impossibilité.
 */
export function quoteAuthorizesRepair(status: DocumentStatus | null | undefined): boolean {
  return status === "ACCEPTED" || status === "PAID";
}

/**
 * Décision du client sur un devis.
 *
 * Le devis engage le client : c'est lui qui l'accepte ou le refuse, et lui
 * seul. Le technicien ne peut ni valider à sa place ni exiger l'acceptation —
 * il peut seulement attendre qu'elle vienne, ou constater le refus.
 *
 * L'acceptation et le règlement sont deux gestes distincts : accepter porte sur
 * le travail à faire, régler sur l'argent. Confondre les deux obligerait le
 * client à payer pour autoriser une intervention, et le priverait du droit de
 * refuser en gardant son argent.
 *
 * Les deux issues déplacent la demande en réparation. Le refus évident : le
 * client a rejeté un montant, pas l'intervention, et le technicien doit pouvoir
 * corriger. L'acceptation aussi, et c'est moins évident : la demande restait en
 * `PENDING_QUOTE` alors que le devis venait d'être accepté et que le technicien
 * venait d'être prévenu qu'il pouvait réparer. Elle y attendait un statut qu'il
 * n'avait plus le droit de poser — sauf si le client règlait avant, auquel cas
 * il ne le pouvait plus du tout.
 */
export async function decideQuote(
  actor: TicketActor,
  invoiceId: string,
  decision: QuoteDecision
): Promise<TicketResult<QuoteInvoice>> {
  if (decision !== "ACCEPT" && decision !== "REJECT") {
    return fail("Décision invalide : ACCEPT ou REJECT attendu", 400);
  }

  const invoice = await prisma.quoteInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      ticket: {
        include: {
          client: true,
          technician: { select: PUBLIC_USER_SELECT },
        },
      },
      payment: true,
    },
  });

  if (!invoice || !invoice.ticket) {
    return fail("Devis introuvable", 404);
  }

  // Seul le client concerné décide. Le technicien qui a rédigé le devis est
  // précisément celui dont la réponse ne peut pas être présumée.
  if (invoice.ticket.client.userId !== actor.userId) {
    return fail("Ce devis ne vous est pas adressé", 403);
  }

  // Un devis déjà réglé est un contrat exécuté : on ne le rediscute pas.
  if (invoice.payment) {
    return fail("Ce devis a déjà été réglé", 409);
  }

  // Seul un devis envoyé attend une décision. Un brouillon n'a pas encore été
  // vu, et un devis déjà tranché ne se reprend pas en silence.
  if (invoice.status !== "SENT") {
    return fail("Ce devis n'attend pas de décision", 409);
  }

  const accepted = decision === "ACCEPT";

  const updated = await prisma.$transaction(async (tx) => {
    const quote = await tx.quoteInvoice.update({
      where: { id: invoiceId },
      data: {
        status: accepted ? "ACCEPTED" : "REJECTED",
        // L'acceptation ne vaut pas règlement : les deux dates sont
        // conservées séparément pour que la piste reste lisible.
        acceptedAt: accepted ? new Date() : null,
        rejectedAt: accepted ? null : new Date(),
      },
    });

    await tx.ticket.update({
      where: { id: invoice.ticket!.id },
      data: { status: TicketStatus.REPAIRING },
    });

    return quote;
  });

  // Le technicien attend cette réponse : il ne peut pas avancer sans elle.
  if (invoice.ticket.technicianId) {
    await notify({
      userIds: [invoice.ticket.technicianId],
      type: accepted
        ? NotificationType.QUOTE_ACCEPTED
        : NotificationType.QUOTE_REJECTED,
      title: accepted ? "Devis accepté" : "Devis refusé",
      body: accepted
        ? `${invoice.ticket.reference} · ${invoice.ticket.client.name} a accepté votre devis de ${formatAmount(invoice.totalAmount)}. Vous pouvez lancer la réparation.`
        : `${invoice.ticket.reference} · ${invoice.ticket.client.name} a refusé votre devis de ${formatAmount(invoice.totalAmount)}. Corrigez-le ou signalez une impossibilité.`,
      ticketId: invoice.ticket.id,
    });
  }

  return { ok: true, data: updated };
}

/**
 * Enregistre le règlement d'un devis par le client.
 *
 * Seul le client concerné peut régler : c'est lui qui doit payer et lui seul
 * qui décide du moyen de paiement. Le technicien encaisse, il ne déclare pas
 * le paiement à la place du client.
 *
 * Le montant est celui du devis, jamais celui transmis par l'appelant : le
 * client ne doit pas pouvoir payer un montant de son choix et solder une
 * facture en laissant un centime.
 */
export async function payQuote(
  actor: TicketActor,
  ticketId: string,
  input: PayQuoteInput
): Promise<TicketResult<Payment>> {
  return recordPayment(actor, ticketId, input, payQuoteDoc);
}

/**
 * Déclaration d'un encaissement par le technicien.
 *
 * Un règlement en espèces n'a pas d'auteur déclaré : le client n'a pas besoin
 * d'ouvrir l'application, et il peut même être absent — le technicien encaisse
 * sur place. Sans ce chemin, ce paiement n'existait nulle part : il n'entrait
 * ni dans le relevé du technicien, ni dans la facturation de la régie, et le
 * montant payé n'était traçable par personne.
 *
 * Le technicien ne déclare que du **cash**. Lui laisser déclarer un Mobile
 * Money reviendrait à lui permettre d'afficher un règlement que le client nie
 * avoir fait : le prix est un fait qu'il constate, pas une intention qu'il
 * déclare. Le Mobile Money reste déclaré par le client, qui en détient la
 * référence.
 */
export async function declareCashCollection(
  actor: TicketActor,
  ticketId: string,
  input: PayQuoteInput
): Promise<TicketResult<Payment>> {
  return recordPayment(actor, ticketId, input, cashCollectionDoc);
}

/** Règles de fond communes : qui peut, et à quelles conditions. */
interface PaymentRecorderRules {
  /// Le client est le seul à pouvoir régler son devis.
  readonly clientOnly: boolean;
  /// Le cash est receivable par le client sur sa propre facture.
  readonly allowCash: boolean;
}

const payQuoteDoc: PaymentRecorderRules = { clientOnly: true, allowCash: true };
const cashCollectionDoc: PaymentRecorderRules = { clientOnly: false, allowCash: false };

async function recordPayment(
  actor: TicketActor,
  ticketId: string,
  input: PayQuoteInput,
  doc: PaymentRecorderRules
): Promise<TicketResult<Payment>> {
  const { channel, operator, transactionRef } = input;

  // Le cash déclaré par le technicien n'a pas d'opérateur, et aucun autre moyen
  // ne lui est ouvert : voir `declareCashCollection`.
  if (!doc.allowCash && channel !== PaymentChannel.CASH) {
    return fail("Le technicien ne déclare qu'un encaissement en espèces", 403);
  }


  if (!channel || !CHANNELS.has(channel)) {
    return fail("Moyen de paiement inconnu", 400);
  }

  // Wave, Orange et MTN ne sont pas interchangeables : l'identité de
  // l'opérateur est ce qui permet de rapprocher la transaction du paiement.
  if (channel === PaymentChannel.MOBILE_MONEY && (!operator || !OPERATORS.has(operator))) {
    return fail("Choisissez l'opérateur Mobile Money (Wave, Orange, MTN)", 400);
  }

  if (channel !== PaymentChannel.MOBILE_MONEY && operator) {
    return fail("Un opérateur n'a de sens que pour un paiement Mobile Money", 400);
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      client: true,
      quoteInvoice: { include: { payment: true } },
    },
  });

  if (!ticket || !ticket.quoteInvoice) {
    return fail("Cette demande n'a pas de devis à régler", 404);
  }

  // Le client règle son propre devis. Le technicien, lui, déclare seulement ce
  // qu'il a encaissé sur la demande qui lui est affectée — jamais celle d'un
  // collègue, jamais une demande sans devis.
  if (doc.clientOnly) {
    if (ticket.client.userId !== actor.userId) {
      return fail("Ce devis ne vous est pas adressé", 403);
    }
  } else if (actor.role !== "TECHNICIAN" || ticket.technicianId !== actor.userId) {
    return fail("Seul le technicien affecté à cette demande déclare l'encaissement", 403);
  }

  const invoice = ticket.quoteInvoice;

  if (invoice.payment) {
    return fail("Ce devis a déjà été réglé", 409);
  }

  // On ne règle pas un devis qu'on n'a pas accepté : ce serait payer pour
  // autoriser une intervention, et le client perdrait le droit de refuser en
  // gardant son argent. Le refus se décide avant le règlement, jamais par lui.
  if (invoice.status !== "ACCEPTED") {
    return fail("Acceptez le devis avant de le régler", 409);
  }

  if (invoice.totalAmount <= 0) {
    return fail("Ce devis ne comporte aucun montant à régler", 400);
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        quoteInvoiceId: invoice.id,
        amount: invoice.totalAmount,
        channel: channel as PaymentChannel,
        operator: (operator as MobileMoneyOperator | undefined) ?? null,
        transactionRef: transactionRef || null,
        status: "COMPLETED",
      },
    });

    await tx.quoteInvoice.update({
      where: { id: invoice.id },
      data: { status: "PAID" },
    });

    // Régler ne clôt pas la demande. Le client paie un travail qu'il a
    // accepté ; il ne décide pas que le travail est fait, et la demande peut
    // même être réglée avant que le technicien n'ait fini. La demande
    // n'avance donc que si le travail était déjà déclaré terminé — sinon elle
    // reste où elle est, et c'est le technicien qui la solde.
    if (ticket.status === TicketStatus.COMPLETED) {
      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.PENDING_PAYMENT },
      });
    }

    return created;
  });

  // Le technicien doit savoir que le devis est réglé : c'est lui qui encaisse
  // sur place, et lui qui solde ensuite la demande.
  if (ticket.technicianId) {
    await notify({
      userIds: [ticket.technicianId],
      type: NotificationType.PAYMENT_RECEIVED,
      title: "Devis réglé",
      body: `${ticket.reference} · ${ticket.client.name} a réglé ${formatAmount(invoice.totalAmount)} par ${paymentLabel(channel as PaymentChannel, operator as MobileMoneyOperator | undefined)}.`,
      ticketId: ticket.id,
    });
  }

  return { ok: true, data: payment };
}

/** Libellé lisible du moyen de paiement, pour les notifications. */
export function paymentLabel(
  channel: PaymentChannel,
  operator: MobileMoneyOperator | undefined
): string {
  if (channel === PaymentChannel.MOBILE_MONEY && operator) {
    return `Mobile Money ${OPERATOR_LABEL[operator]}`;
  }

  return CHANNEL_LABEL[channel];
}

/** Montant formaté, en FCFA. */
export function formatAmount(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}
