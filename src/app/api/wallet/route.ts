import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Portefeuille du technicien : ce que ses clients lui ont réglé, et quand.
 *
 * Une recette n'entre au portefeuille qu'à deux conditions : le règlement est
 * **effectué** (`COMPLETED`) et il porte sur un devis d'une demande qui lui
 * est affectée. Un `PENDING` est une intention de paiement, pas un encaissement ;
 * un `FAILED` ne l'a jamais été ; un `REFUNDED` a été repris, et le compter
 * comme une recette ferait mentir le total.
 *
 * Les remboursements sont malgré làadata, mais **hors des sommes** : ils
 * figurent dans l'historique sans gonfler ni le total, ni le mois, ni les
 * ventilations. Les supprimer rendrait le relevé faux dans l'autre sens — un
 * montant payé puis repris disparaîtrait, et le technicien ne verrait plus
 * pourquoi la somme qu'il a encaissée ne correspond pas à son total.
 *
 * Rien n'est stocké : tout est recalculé depuis les règlements. Un total
 * mémorisé se désynchronise de la réalité au premier remboursement oublié, et
 * l'écart serait alors indétectable. Le coût tient en une agrégation.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getApiUser(request);

    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Le portefeuille est un relevé personnel : un technicien n'a pas à en lire
    // un autre, et un client n'a rien à y voir.
    if (auth.role !== "TECHNICIAN") {
      return NextResponse.json(
        { error: "Le portefeuille est réservé aux techniciens" },
        { status: 403 }
      );
    }

    const rows = await prisma.payment.findMany({
      where: {
        // Les remboursements sont lus avec les règlements, mais ne comptent pas
        // comme recettes : voir `summarize`.
        status: { in: [PaymentStatus.COMPLETED, PaymentStatus.REFUNDED] },
        quoteInvoice: { ticket: { technicianId: auth.userId } },
      },
      select: {
        id: true,
        amount: true,
        channel: true,
        operator: true,
        transactionRef: true,
        status: true,
        createdAt: true,
        quoteInvoice: {
          select: {
            totalAmount: true,
            ticket: { select: { id: true, reference: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const months = Number(request.nextUrl.searchParams.get("months") ?? 12);

    return NextResponse.json({ data: summarize(rows, months) });
  } catch (error) {
    console.error("Wallet error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la lecture du portefeuille" },
      { status: 500 }
    );
  }
}

type PaymentRow = {
  id: string;
  amount: number;
  channel: string;
  operator: string | null;
  transactionRef: string | null;
  status: string;
  createdAt: Date;
  quoteInvoice: {
    totalAmount: number;
    ticket: { id: string; reference: string; status: string };
  };
};

/** Regroupement par mois calendaire : la clé est `AAAA-MM`. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABELS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Libellé lisible : « octobre 2026 ». */
function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[Number(month) - 1]} ${year}`;
}

/**
 * Agrège les règlements en trois lectures : le total, le mois en cours, et le
 * détail mois par mois.
 *
 * Le mois en cours est isolé des autres parce que c'est le chiffre que le
 * technicien consulte le plus souvent, et qu'il ne se déduit pas d'un total
 * cumulé sans risque de confusion entre « ce mois-ci » et « depuis toujours ».
 */
function summarize(rows: PaymentRow[], months: number) {
  const currentKey = monthKey(new Date());

  const byMonth = new Map<
    string,
    { amount: number; count: number; byChannel: Record<string, number> }
  >();

  let total = 0;
  let currentMonth = 0;
  let refunded = 0;
  let settled = 0;
  const channels: Record<string, number> = {};

  for (const row of rows) {
    // Un remboursement est un mouvement d'argent, pas une recette : il traverse
    // l'historique, il ne s'ajoute à aucun total.
    if (row.status === "REFUNDED") {
      refunded += row.amount;
      continue;
    }

    const key = monthKey(row.createdAt);

    const bucket = byMonth.get(key) ?? { amount: 0, count: 0, byChannel: {} };
    bucket.amount += row.amount;
    bucket.count += 1;
    bucket.byChannel[row.channel] = (bucket.byChannel[row.channel] ?? 0) + row.amount;
    byMonth.set(key, bucket);

    total += row.amount;
    channels[row.channel] = (channels[row.channel] ?? 0) + row.amount;
    if (key === currentKey) currentMonth += row.amount;
    settled += 1;
  }

  // Les lignes sont déjà triées du plus récent au plus ancien : la clé l'est donc
  // aussi, et les mois sans règlement disparaissent au lieu de laisser un trou
  // dans la liste — un mois sans recette n'a rien à raconter.
  const monthly = [...byMonth.entries()]
    .slice(0, Math.max(1, months))
    .map(([key, value]) => ({
      key,
      label: monthLabel(key),
      amount: value.amount,
      count: value.count,
      byChannel: value.byChannel,
    }));

  return {
    // `total` est l'encaissement cumulé, pas un solde : WiFiCare ne retient
    // aucune part et n'a donc rien à déduire. Le nom le dit, pour que personne
    // n'y lise un relevé bancaire.
    totalAmount: round(total),
    currentMonthKey: currentKey,
    currentMonthLabel: monthLabel(currentKey),
    currentMonthAmount: round(currentMonth),
    // Nombre d'interventions **payées**, distinct des interventions menées :
    // une intervention gratuite n'est pas comptée, sinon le technicien
    // verrait son travail rewarded par un zéro.
    paidInterventions: settled,
    // Affiché à part du total : « encaissé », puis « dont remboursé ». Les deux
    // ensemble disent ce que le technicien garde réellement.
    refundedAmount: round(refunded),
    byChannel: roundRecord(channels),
    monthly,
    payments: rows.slice(0, 20).map((row) => ({
      id: row.id,
      amount: round(row.amount),
      // `REFUNDED` permet à l'écran de rendre l'entrée négative et non une
      // recette, plutôt que d'aligner un montant positif sur un paiement repris.
      status: row.status,
      channel: row.channel,
      operator: row.operator,
      transactionRef: row.transactionRef,
      paidAt: row.createdAt,
      ticketId: row.quoteInvoice.ticket.id,
      ticketReference: row.quoteInvoice.ticket.reference,
      ticketStatus: row.quoteInvoice.ticket.status,
    })),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, round(value)]),
  );
}
