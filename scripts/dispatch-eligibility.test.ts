/**
 * Règles de re-proposition d'une demande à un technicien.
 *
 * `isEligible` décide seule du sort d'une demande, sans lire la base : c'est la
 * fonction dont une erreur enverrait une demande déjà refusée chez quelqu'un qui
 * a dit non, ou qui immobiliserait une demande dans une poche. Elle est donc
 * testée seule, sans base ni serveur.
 *
 * Le runner est celui de Node (`node --test` via `tsx`) : aucun paquet n'est
 * ajouté au projet pour vérifier une fonction pure. L'end-to-end, lui, est le
 * fait de `probe-dispatch.ts` — les deux ne se recouvrent pas, celui-ci ne
 * verrait pas passer une ré-offre faite pendant la fenêtre de cinq secondes.
 *
 *     npm run dispatch:test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TaskOfferStatus } from "@prisma/client";

import { isEligible, RE_OFFER_COOLDOWN_MS } from "../src/lib/dispatch";

const NOW = new Date("2026-02-20T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const offer = (
  status: TaskOfferStatus,
  offeredAt: number,
  respondedAt: number | null = null
) => ({
  status,
  offeredAt: ago(offeredAt),
  respondedAt: respondedAt === null ? null : ago(respondedAt),
});

describe("éligibilité à une proposition", () => {
  it("propose à un technicien qui n'a jamais vu la demande", () => {
    assert.equal(isEligible(undefined, NOW), true);
  });

  it("ne repropose pas une demande déjà prise", () => {
    const accepted = offer(TaskOfferStatus.ACCEPTED, 10 * 60_000);

    // Même après le délai de redistribution, et même si la prise est ancienne :
    // la demande est à lui, elle ne circule plus.
    assert.equal(isEligible(accepted, NOW), false);
    assert.equal(isEligible(accepted, new Date(NOW.getTime() + 86_400_000)), false);
  });

  it("ne repropose pas une demande déjà refusée", () => {
    const declined = offer(TaskOfferStatus.DECLINED, 10 * 60_000, 9 * 60_000);

    assert.equal(isEligible(declined, NOW), false);
    assert.equal(isEligible(declined, new Date(NOW.getTime() + 86_400_000)), false);
  });

  it("attend le délai de redistribution avant de reproposer", () => {
    const withdrawn = offer(TaskOfferStatus.WITHDRAWN, 1_000);

    // Une proposition retirée il y a une seconde n'est pas un refus : la
    // demande doit continuer de circuler, mais pas au même rythme que la boucle,
    // sinon le même technicien la reçoit autant de fois qu'il consulte la file.
    assert.equal(isEligible(withdrawn, NOW), false);
    assert.equal(
      isEligible(withdrawn, new Date(NOW.getTime() + RE_OFFER_COOLDOWN_MS)),
      true
    );
  });

  it("repart après expiration de la proposition, sans réponse", () => {
    const expired = offer(TaskOfferStatus.EXPIRED, 2 * RE_OFFER_COOLDOWN_MS);

    assert.equal(isEligible(expired, NOW), true);
  });

  it("repart aussi après une proposition restée sans réponse", () => {
    const pending = offer(TaskOfferStatus.PENDING, 2 * RE_OFFER_COOLDOWN_MS);

    assert.equal(isEligible(pending, NOW), true);
  });

  it("mesure le délai depuis la réponse, pas depuis la proposition", () => {
    // Retirée il y a une heure, mais répondue à l'instant : la réponse est ce qui
    // compte, sinon une réponse récente rouvrirait la porte trop tôt.
    const justResponded = offer(
      TaskOfferStatus.WITHDRAWN,
      3_600_000,
      1_000
    );

    assert.equal(isEligible(justResponded, NOW), false);
    assert.equal(
      isEligible(justResponded, new Date(NOW.getTime() + RE_OFFER_COOLDOWN_MS)),
      true
    );
  });

  it("traite une réponse sans date comme une absence de réponse", () => {
    // `respondedAt` est nul sur une proposition retirée par la prise d'un autre :
    // le retrait est bien daté, mais la réponse n'existe pas.
    const withdrawnWithoutResponse = offer(TaskOfferStatus.WITHDRAWN, 1_000, null);

    assert.equal(isEligible(withdrawnWithoutResponse, NOW), false);
  });
});