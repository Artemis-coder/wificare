import { PrismaClient } from "@prisma/client";

/**
 * Fusion du rôle `ADMIN` dans le rôle `SUPER_ADMIN`.
 *
 * Le rôle `ADMIN` a disparu de l'enum `Role` : la régie n'a plus qu'un seul
 * profil d'administration, celui qui gère toute la plateforme. Ce script est le
 * pont entre l'ancien et le nouveau schéma.
 *
 * Il doit être lancé **avant** `prisma db push` : Postgres ne sait pas retirer
 * une valeur d'un enum, et la manipulation échoue tant qu'une ligne porte encore
 * `ADMIN`. Le compte concerné devient `SUPER_ADMIN`, ce qui lui conserve l'accès
 * à l'ensemble des écrans d'administration.
 *
 * Après `prisma db push`, `prisma/zone-status-defaults.ts` met les zones déjà
 * existantes en `ACTIVE` : elles existaient avant la mise en validation et
 * personne ne doit avoir à revalider un parc déjà en service.
 *
 * Script idempotent : le relancer sur une base déjà migrée ne change rien.
 */

const prisma = new PrismaClient();

async function main() {
  // Une fois `prisma db push` passé, la valeur `ADMIN` n'existe plus dans
  // l'enum : le script s'arrête là plutôt que d'échouer sur un cast invalide.
  const exists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_enum
        WHERE enumtypid = '"Role"'::regtype AND enumlabel = 'ADMIN'
     ) AS exists`
  );

  if (!exists[0]?.exists) {
    console.log("La valeur ADMIN n'existe plus dans l'enum Role : rien à migrer.");
    return;
  }

  const merged = await prisma.$executeRaw`
    UPDATE "User" SET role = 'SUPER_ADMIN'::"Role" WHERE role = 'ADMIN'::"Role"
  `;

  const remaining = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT count(*)::int AS count FROM "User" WHERE role::text = 'ADMIN'`
  );

  console.log(`Comptes ADMIN convertis en SUPER_ADMIN : ${merged}`);
  console.log(`Comptes ADMIN restants : ${remaining[0]?.count ?? 0}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());