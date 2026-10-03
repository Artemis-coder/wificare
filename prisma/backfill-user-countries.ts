/**
 * Rattache chaque compte existant à son pays, déduit de son numéro.
 *
 * La colonne `User.country` est née avec le tableau de bord de couverture : les
 * comptes déjà enregistrés n'ont pas de pays écrit, parce que le sélecteur de
 * pays ne faisait que guider la saisie du numéro sans rien enregistrer. Ce
 * script comble ce manque en relisant le plan de numérotation de chaque numéro,
 * et en écrivant ce qu'il reconnaît — la même lecture que celle de
 * `lib/user-country`, donc le même pays qu'aurait donné l'écran de connexion.
 *
 * Il est sans danger à rejouer : seuls les comptes sans pays sont touchés, et un
 * pays déjà écrit n'est jamais réécrit. Aucun compte n'est créé ni supprimé.
 *
 *   npx tsx prisma/backfill-user-countries.ts            # compte ce qui partirait
 *   npx tsx prisma/backfill-user-countries.ts --yes      # l'exécute
 *
 * Sans `--yes`, le script n'écrit rien.
 */
import { PrismaClient } from "@prisma/client";

import { resolveCountryCode } from "../src/lib/user-country";

const prisma = new PrismaClient();

const WRITE = process.argv.includes("--yes");

/** Libellé affiché pour un pays inconnu ou un compte sans numéro lisible. */
const UNKNOWN_LABEL = "non déterminable";

async function main() {
  const pending = await prisma.user.findMany({
    where: { country: null },
    select: { id: true, phone: true },
  });

  if (pending.length === 0) {
    console.log("Tous les comptes ont déjà un pays. Rien à faire.");
    return;
  }

  // Comptes regroupés par pays, pour que la sortie ressemble à la carte que le
  // tableau de bord affichera juste après.
  const byCountry = new Map<string, number>();

  for (const user of pending) {
    const country = resolveCountryCode(undefined, user.phone) ?? UNKNOWN_LABEL;

    byCountry.set(country, (byCountry.get(country) ?? 0) + 1);
  }

  const rows = [...byCountry.entries()].sort(
    ([codeA, countA], [codeB, countB]) =>
      countB - countA || codeA.localeCompare(codeB),
  );

  console.log(
    `${WRITE ? "Rattachement" : "Simulation"} : ${pending.length} compte(s) sans pays\n`,
  );

  for (const [code, count] of rows) {
    console.log(`  ${code.padEnd(4)} ${count} compte(s)`);
  }

  if (!WRITE) {
    console.log(
      `\nSimulation : aucune écriture. Relancer avec --yes pour appliquer.`,
    );
    return;
  }

  // Une transaction par tranche plutôt qu'une seule : la liste peut compter
  // plusieurs milliers de comptes, et une transaction unique les tiendrait tous
  // ouverts. Le lot est assez petit pour qu'un échec ne fasse pas perdre le
  // travail des tranches précédentes, chaque écriture étant idempotente.
  const BATCH = 200;

  let written = 0;

  for (let start = 0; start < pending.length; start += BATCH) {
    const batch = pending.slice(start, start + BATCH);

    const updates = batch.flatMap((user) => {
      const country = resolveCountryCode(undefined, user.phone);

      // Un numéro sans aucun chiffre laisse le compte sans pays : il restera
      // dans la même situation à la prochaine exécution.
      return country ? [prisma.user.update({ where: { id: user.id }, data: { country } })] : [];
    });

    await prisma.$transaction(updates);

    written += updates.length;
  }

  console.log(`\n${written} compte(s) rattachés à leur pays.`);
}

main()
  .catch((error) => {
    console.error("Backfill pays error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });