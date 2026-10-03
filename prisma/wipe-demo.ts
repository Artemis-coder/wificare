/**
 * Vide les données de démonstration en conservant l'accès à la régie.
 *
 * Le seed crée huit comptes de test. En les supprimant tous, plus personne ne
 * peut se connecter au back-office : la connexion par numéro crée un compte
 * `CLIENT`, jamais un administrateur. Ce script retire donc tout, sauf les
 * comptes indiqués par `--keep`, et laisse la base prête à accueillir de vrais
 * comptes.
 *
 * `--keep` accepte plusieurs numéros séparés par des virgules : conserver aussi
 * un technicien laisse la régie avec quelqu'un à qui affecter une demande, ce
 * qu'un administrateur seul ne permet pas. Au moins l'un d'eux doit être
 * `SUPER_ADMIN`, faute de quoi personne n administersait la plateforme.
 *
 * L'activité des comptes conservés est remise à zéro : il ne resterait pas
 * d'historique d'un jeu de données dont toutes les lignes sont parties. Leur
 * identité ne l'est pas — un numéro, un rôle, un pays ne décrivent pas ce qui a
 * été effacé.
 *
 * Le schéma n'est pas touché : seules les lignes partent.
 *
 *   npx tsx prisma/wipe-demo.ts --dry-run     # compte ce qui partirait
 *   npx tsx prisma/wipe-demo.ts --yes          # l'exécute
 *   npx tsx prisma/wipe-demo.ts --yes --keep 2250909090909,2250101407476
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

/** Numéros passés à `--keep`, séparés par des virgules. */
function keepArg(): string[] {
  const raw = arg("--keep") ?? DEFAULT_KEEP;

  return [
    ...new Set(
      raw
        .split(",")
        .map((phone) => phone.trim())
        .filter(Boolean),
    ),
  ];
}

async function main() {
  const confirmed = process.argv.includes("--yes");
  const dryRun = process.argv.includes("--dry-run");
  const keep = keepArg();

  const survivors = await prisma.user.findMany({
    where: { phone: { in: keep } },
    select: { id: true, phone: true, name: true, role: true },
  });

  // Un numéro demandé et absent est une faute de frappe, pas une intention :
  // conserver deux comptes sur trois laisserait croire que le troisième est
  // encore là. On s'arrête plutôt que de vider la base sur un numéro faux.
  const missing = keep.filter(
    (phone) => !survivors.some((survivor) => survivor.phone === phone),
  );

  if (missing.length > 0) {
    console.error(
      `Aucun compte au numéro ${missing.join(", ")}. Rien n'a été supprimé.\n` +
        `Passez les bons numéros : npx tsx prisma/wipe-demo.ts --yes --keep <numéros>`,
    );
    process.exitCode = 1;
    return;
  }

  // Sans administrateur, personne ne peut gérer les comptes, les rôles et les
  // zones : la plateforme resterait sans porte d'entrée. Le script refuse donc
  // de finir dans cet état.
  if (!survivors.some((survivor) => survivor.role === "SUPER_ADMIN")) {
    console.error(
      `Aucun des comptes conservés (${keep.join(", ")}) n'est SUPER_ADMIN.\n` +
        `Il ne resterait personne pour administrer la plateforme.`,
    );
    process.exitCode = 1;
    return;
  }

  const survivorIds = survivors.map((survivor) => survivor.id);

  const doomedUsers = await prisma.user.count({
    where: { id: { notIn: survivorIds } },
  });

  console.log("Conservés :");
  for (const survivor of survivors) {
    console.log(`  ${survivor.name} (${survivor.phone}, ${survivor.role})`);
  }
  console.log(`Comptes retirés : ${doomedUsers}`);
  console.log();

  if (dryRun) {
    let preview = 0;
    for (const table of TABLES) {
      const count = await table.count();
      preview += count;
      console.log(`  ${table.label.padEnd(28)} ${count}`);
    }
    console.log(`  ${"comptes".padEnd(28)} ${doomedUsers}`);
    console.log(`  ${"activité des conservés".padEnd(28)} ${survivors.length}`);
    console.log(`\nTotal : ${preview + doomedUsers + survivors.length} lignes.`);
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
  const { count: removed } = await prisma.user.deleteMany({
    where: { id: { notIn: survivorIds } },
  });
  total += removed;
  console.log(`  ${"comptes".padEnd(28)} ${removed}`);

  // L'activité des comptes conservés part avec le reste : un compteur de
  // connexions resté à 3 décrirait un historique dont aucune ligne n'existe
  // plus. Le pays, lui, reste — il décrit qui est le compte, pas ce qui a été
  // fait.
  const { count: reset } = await prisma.user.updateMany({
    where: { id: { in: survivorIds } },
    data: { loginCount: 0, lastLoginAt: null },
  });
  console.log(`  ${"activité des conservés".padEnd(28)} ${reset}`);

  console.log(
    `\n${total + reset} lignes supprimées. Il ne reste que ${keep.join(", ")}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
