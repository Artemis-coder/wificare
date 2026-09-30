import { PrismaClient, Role, TicketStatus, Priority, PaymentChannel } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create a Technician
  const tech = await prisma.user.upsert({
    where: { phone: '+2250102030405' },
    update: {},
    create: {
      name: 'Jean Dupont',
      phone: '+2250102030405',
      role: Role.TECHNICIAN,
    },
  });

  // 2. Create an Admin
  const admin = await prisma.user.upsert({
    where: { phone: '+2250505050505' },
    update: {},
    create: {
      name: 'Admin Wi-Fi Care',
      phone: '+2250505050505',
      role: Role.ADMIN,
    },
  });

  // 3. Create a Client user
  const clientUser = await prisma.user.upsert({
    where: { phone: '+2250707070707' },
    update: {},
    create: {
      name: 'Kouassi Marc',
      phone: '+2250707070707',
      role: Role.CLIENT,
    },
  });

  // 4. Create a Client entity linked to the user
  const client = await prisma.client.create({
    data: {
      name: 'M. Kouassi',
      contact: '+2250707070707',
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
  });

  const wifiZone = await prisma.wifiZone.findFirst({
    where: { clientId: client.id }
  });

  if (wifiZone) {
    // 5. Create a Ticket
    const ticket = await prisma.ticket.create({
      data: {
        reference: '#TK-2026-001',
        type: 'Panne',
        description: 'Le routeur est éteint et pas de signal.',
        priority: Priority.HIGH,
        status: TicketStatus.NEW,
        clientId: client.id,
        wifiZoneId: wifiZone.id,
      }
    });

    const ticket2 = await prisma.ticket.create({
      data: {
        reference: '#TK-2026-002',
        type: 'Lenteur',
        description: 'La connexion est très lente depuis hier.',
        priority: Priority.NORMAL,
        status: TicketStatus.ASSIGNED,
        clientId: client.id,
        wifiZoneId: wifiZone.id,
        technicianId: tech.id,
      }
    });

    const ticket3 = await prisma.ticket.create({
      data: {
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
            payment: {
              create: {
                amount: 15000,
                channel: PaymentChannel.MOBILE_MONEY,
                status: 'COMPLETED'
              }
            }
          }
        }
      }
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
