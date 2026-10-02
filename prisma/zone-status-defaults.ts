import { PrismaClient } from "@prisma/client";

/**
 * Mise en `ACTIVE` des Wi-Fi Zones préexistantes.
 *
 * `WifiZone.status` distingue une zone déclarée par son propriétaire, en attente
 * de validation par le super administrateur, d'une zone validée. Le parc déjà en
 * service au moment du déploiement a été déclaré avant l'existence de ce
 * contrôle : le faire passer par la validation ferait apparaître des pans de
 * l'activité comme s'ils venaient d'être ajoutés.
 *
 * À lancer **après** `prisma db push` et `prisma/merge-roles.ts`.
 * Script idempotent.
 */

const prisma = new PrismaClient();

async function main() {
  const activated = await prisma.wifiZone.updateMany({
    where: { status: "PENDING" },
    data: { status: "ACTIVE" },
  });

  console.log(`Zones préexistantes passées en ACTIVE : ${activated.count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());