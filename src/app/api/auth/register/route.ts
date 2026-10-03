import { NextRequest, NextResponse } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signTokens } from "@/lib/auth-tokens";
import { hashPassword, isValidPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { resolveCountryCode } from "@/lib/user-country";

/** Les deux types de compte proposés à l'inscription. */
const ACCOUNT_TYPES = ["TECHNICIAN", "WIFI_ZONE_OWNER"] as const;

type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Un propriétaire de zone est un client de la plateforme. */
const ROLE_BY_ACCOUNT_TYPE: Record<AccountType, Role> = {
  TECHNICIAN: Role.TECHNICIAN,
  WIFI_ZONE_OWNER: Role.CLIENT,
};

type RegistrationBody = {
  accountType?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  phone?: unknown;
  password?: unknown;
  zoneName?: unknown;
  zoneLocation?: unknown;
  /** Code ISO du pays choisi dans le sélecteur, « CI ». */
  country?: unknown;
};

/**
 * Création de compte : technicien (intervenant) ou propriétaire de zone Wi-Fi.
 *
 * Le propriétaire de zone reçoit immédiatement un dossier client et sa première
 * zone ; il pourra en ajouter d'autres depuis l'application
 * (`POST /api/wifi-zones`).
 */
export async function POST(request: NextRequest) {
  let body: RegistrationBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const accountType = body.accountType as AccountType | undefined;

  if (!accountType || !ACCOUNT_TYPES.includes(accountType)) {
    return NextResponse.json(
      { error: "Type de compte invalide (TECHNICIAN ou WIFI_ZONE_OWNER attendu)" },
      { status: 400 }
    );
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : "";
  const zoneName = typeof body.zoneName === "string" ? body.zoneName.trim() : "";
  const zoneLocation = typeof body.zoneLocation === "string" ? body.zoneLocation.trim() : "";

  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: "Le nom et le prénom sont requis" },
      { status: 400 }
    );
  }

  if (firstName.length > 60 || lastName.length > 60) {
    return NextResponse.json(
      { error: "Le nom et le prénom ne peuvent pas dépasser 60 caractères" },
      { status: 400 }
    );
  }

  if (phone.length < 8) {
    return NextResponse.json(
      { error: "Numéro de téléphone invalide" },
      { status: 400 }
    );
  }

  if (!isValidPassword(body.password)) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir 4 chiffres" },
      { status: 400 }
    );
  }

  if (accountType === "WIFI_ZONE_OWNER" && !zoneName) {
    return NextResponse.json(
      { error: "Le nom de la zone Wi-Fi est requis" },
      { status: 400 }
    );
  }

  try {
    // Le pays que le client a choisi, ou celui que porte son numéro pour un
    // client plus ancien qui n'envoie rien : c'est de là que vient le « CI » de
    // la colonne, et ce que le tableau de bord regroupe.
    const country = resolveCountryCode(body.country, phone);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName,
          lastName,
          name: `${firstName} ${lastName}`,
          phone,
          passwordHash: hashPassword(body.password as string),
          role: ROLE_BY_ACCOUNT_TYPE[accountType],
          country,
        },
      });

      if (accountType !== "WIFI_ZONE_OWNER") {
        return created;
      }

      // Dossier client + première zone Wi-Fi.
      await tx.client.create({
        data: {
          name: `${firstName} ${lastName}`,
          contact: phone,
          userId: created.id,
          wifiZones: {
            create: [{ name: zoneName, location: zoneLocation || zoneName }],
          },
        },
      });

      return created;
    });

    const tokens = signTokens({ id: user.id, phone: user.phone, role: user.role });

    return NextResponse.json(
      {
        data: {
          user: {
            id: user.id,
            name: user.name,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            role: user.role,
            accountType,
          },
          tokens,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Ce numéro de téléphone est déjà utilisé" },
        { status: 409 }
      );
    }

    console.error("Register error:", error);

    return NextResponse.json(
      { error: "Erreur lors de la création du compte" },
      { status: 500 }
    );
  }
}