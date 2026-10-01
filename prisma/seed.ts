import { PrismaClient, Role, TicketStatus, Priority, PaymentChannel } from '@prisma/client';

import { normalizePhone } from '../src/lib/phone';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

/** Mot de passe (4 chiffres) des comptes de démonstration. */
const DEMO_PASSWORD = '1234';

async function main() {
  console.log('Seeding database...');

  // 1. Create a Technician
  const tech = await prisma.user.upsert({
    where: { phone: normalizePhone('+2250102030405') },
    update: { passwordHash: hashPassword(DEMO_PASSWORD) },
    create: {
      name: 'Jean Dupont',
      phone: normalizePhone('+2250102030405'),
      firstName: 'Jean',
      lastName: 'Dupont',
      passwordHash: hashPassword(DEMO_PASSWORD),
      role: Role.TECHNICIAN,
    },
  });

  // 2. Create an Admin
  await prisma.user.upsert({
    where: { phone: normalizePhone('+2250505050505') },
    update: { passwordHash: hashPassword(DEMO_PASSWORD) },
    create: {
      name: 'Admin Wi-Fi Care',
      phone: normalizePhone('+2250505050505'),
      firstName: 'Admin',
      lastName: 'Wi-Fi Care',
      passwordHash: hashPassword(DEMO_PASSWORD),
      role: Role.ADMIN,
    },
  });

  // 3. Create a Client user
  const clientUser = await prisma.user.upsert({
    where: { phone: normalizePhone('+2250707070707') },
    // Le compte démo peut avoir été créé par une connexion OTP : on lui remet
    // son nom de démonstration.
    update: { name: 'Kouassi Marc', passwordHash: hashPassword(DEMO_PASSWORD) },
    create: {
      name: 'Kouassi Marc',
      firstName: 'Marc',
      lastName: 'Kouassi',
      passwordHash: hashPassword(DEMO_PASSWORD),
      phone: normalizePhone('+2250707070707'),
      role: Role.CLIENT,
    },
  });

  // 4. Create a Client entity linked to the user (idempotent : le compte démo
  //    peut avoir déjà été créé par une connexion).
  const client =
    (await prisma.client.findFirst({ where: { userId: clientUser.id } })) ??
    (await prisma.client.create({
      data: {
        name: 'M. Kouassi',
        contact: normalizePhone('+2250707070707'),
        address: 'Cocody Angré',
        userId: clientUser.id,
        wifiZones: {
          create: [
            {
              name: 'WiFi Zone Angré 8e Tranche',
              location: 'Abidjan, Cocody Angré',
              equipments: {
                create: [
                  { type: 'Routeur', brand: 'TP-Link', model: 'Archer C7' },
                  { type: 'ONT', brand: 'Huawei', model: 'HG8120C' },
                ]
              }
            }
          ]
        }
      }
    }));

  const wifiZone = await prisma.wifiZone.findFirst({
    where: { clientId: client.id }
  });

  if (wifiZone) {
    // 5. Create a Ticket
    await prisma.ticket.upsert({
      where: { reference: '#TK-2026-001' },
      update: {},
      create: {
        reference: '#TK-2026-001',
        type: 'Panne',
        description: 'Le routeur est éteint et pas de signal.',
        priority: Priority.HIGH,
        status: TicketStatus.NEW,
        clientId: client.id,
        wifiZoneId: wifiZone.id,
      },
    });

    await prisma.ticket.upsert({
      where: { reference: '#TK-2026-002' },
      update: {},
      create: {
        reference: '#TK-2026-002',
        type: 'Lenteur',
        description: 'La connexion est très lente depuis hier.',
        priority: Priority.NORMAL,
        status: TicketStatus.ASSIGNED,
        clientId: client.id,
        wifiZoneId: wifiZone.id,
        technicianId: tech.id,
      },
    });

    await prisma.ticket.upsert({
      where: { reference: '#TK-2026-003' },
      update: {},
      create: {
        reference: '#TK-2026-003',
        type: 'Installation',
        description: 'Installation de nouveaux équipements.',
        priority: Priority.URGENT,
        status: TicketStatus.COMPLETED,
        clientId: client.id,
        wifiZoneId: wifiZone.id,
        technicianId: tech.id,
        quoteInvoice: {
          create: {
            type: 'INVOICE',
            status: 'PAID',
            totalAmount: 15000,
            lines: {
              create: [
                {
                  description: 'Remplacement de l\'ONT défectueux',
                  quantity: 1,
                  unitPrice: 15000,
                  totalPrice: 15000
                }
              ]
            },
            payment: {
              create: {
                amount: 15000,
                channel: PaymentChannel.MOBILE_MONEY,
                status: 'COMPLETED'
              }
            }
          }
        }
      },
    });
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
