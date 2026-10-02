/**
 * Vide les données de démonstration en conservant l'accès à la régie.
 *
 * Le seed crée huit comptes de test. En les supprimant tous, plus personne ne
 * peut se connecter au back-office : la connexion par numéro crée un compte
 * `CLIENT`, jamais un administrateur. Ce script retire donc tout, sauf le
 * super administrateur indiqué par `--keep`, et laisse la base prête à
 * accueillir de vrais comptes.
 *
 * Le schéma n'est pas touché : seules les lignes partent.
 *
 *   npx tsx prisma/wipe-demo.ts --dry-run     # compte ce qui partirait
 *   npx tsx prisma/wipe-demo.ts --yes          # l'exécute
 *   npx tsx prisma/wipe-demo.ts --yes --keep 2250909090909
 *
 * Sans `--yes`, le script n'écrit rien. Les suppressions sont irréversibles :
 * sur une base Neon, préférer une branche à un `pg_dump` pour pouvoir
 * remonter le temps.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Numéro du super administrateur à conserver, si aucun n'est fourni. */
const DEFAULT_KEEP = "2250909090909";

/**
 * Tables vidées, enfants d'abord.
 *
 * L'ordre suit les clés étrangères : une facture contient ses lignes, une
 * demande porte son rapport, son devis, son avis et son suivi. Supprimer les
 * demandes en dernier évite d'avoir à énumérer chaque enfant.
 *
 * `count` sert à la simulation, `run` à l'exécution. Les deux sont séparés
 * pour qu'une simulation ne puisse pas écrire : c'est une base distante, et
 * une faute de frappe dans un `--dry-run` ne doit pas se payer en données.
 */
const TABLES = [
  { label: "lignes de facture", count: () => prisma.invoiceLine.count(), run: () => prisma.invoiceLine.deleteMany() },
  { label: "paiements", count: () => prisma.payment.count(), run: () => prisma.payment.deleteMany() },
  { label: "factures", count: () => prisma.quoteInvoice.count(), run: () => prisma.quoteInvoice.deleteMany() },
  { label: "avis", count: () => prisma.evaluation.count(), run: () => prisma.evaluation.deleteMany() },
  { label: "suivis de position", count: () => prisma.technicianTracking.count(), run: () => prisma.technicianTracking.deleteMany() },
  { label: "fichiers joints", count: () => prisma.file.count(), run: () => prisma.file.deleteMany() },
  { label: "rapports d'intervention", count: () => prisma.intervention.count(), run: () => prisma.intervention.deleteMany() },
  { label: "notifications", count: () => prisma.notification.count(), run: () => prisma.notification.deleteMany() },
  { label: "jetons de notification", count: () => prisma.pushToken.count(), run: () => prisma.pushToken.deleteMany() },
  { label: "abonnements web push", count: () => prisma.webPushSubscription.count(), run: () => prisma.webPushSubscription.deleteMany() },
  { label: "diffusions", count: () => prisma.broadcast.count(), run: () => prisma.broadcast.deleteMany() },
  { label: "demandes", count: () => prisma.ticket.count(), run: () => prisma.ticket.deleteMany() },
  { label: "équipements", count: () => prisma.equipment.count(), run: () => prisma.equipment.deleteMany() },
  { label: "Wi-Fi Zones", count: () => prisma.wifiZone.count(), run: () => prisma.wifiZone.deleteMany() },
  { label: "dossiers client", count: () => prisma.client.count(), run: () => prisma.client.deleteMany() },
] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const confirmed = process.argv.includes("--yes");
  const dryRun = process.argv.includes("--dry-run");
  const keep = arg("--keep") ?? DEFAULT_KEEP;

  const survivor = await prisma.user.findUnique({
    where: { phone: keep },
    select: { id: true, phone: true, name: true, role: true },
  });

  if (!survivor) {
    console.error(
      `Aucun compte au numéro ${keep}. Rien n'a été supprimé.\n` +
        `Passez un autre numéro : npx tsx prisma/wipe-demo.ts --yes --keep <numéro>`,
    );
    process.exitCode = 1;
    return;
  }
  if (survivor.role !== "SUPER_ADMIN") {
    console.error(
      `Le compte ${keep} est ${survivor.role}, pas SUPER_ADMIN. Le conserver ne\n` +
        `laisserait personne pour administrer la plateforme.`,
    );
    process.exitCode = 1;
    return;
  }

  const doomedUsers = await prisma.user.count({ where: { id: { not: survivor.id } } });

  console.log(`Conservé       : ${survivor.name} (${survivor.phone}, ${survivor.role})`);
  console.log(`Comptes retirés: ${doomedUsers}`);
  console.log();

  if (dryRun) {
    let preview = 0;
    for (const table of TABLES) {
      const count = await table.count();
      preview += count;
      console.log(`  ${table.label.padEnd(28)} ${count}`);
    }
    console.log(`  ${"comptes".padEnd(28)} ${doomedUsers}`);
    console.log(`\nTotal : ${preview + doomedUsers} lignes.`);
    console.log("Simulation. Relancez avec --yes pour exécuter.");
    return;
  }
  if (!confirmed) {
    console.log("Aucune écriture : ajoutez --yes.");
    return;
  }

  let total = 0;
  for (const table of TABLES) {
    const { count } = await table.run();
    total += count;
    console.log(`  ${table.label.padEnd(28)} ${count}`);
  }
  const { count: removed } = await prisma.user.deleteMany({ where: { id: { not: survivor.id } } });
  total += removed;
  console.log(`  ${"comptes".padEnd(28)} ${removed}`);

  console.log(`\n${total} lignes supprimées. Il ne reste que ${survivor.phone}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
