import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import {
  createUser,
  denyUnlessSuperAdminApi,
  type PublicUser,
} from "@/lib/user-admin";

/**
 * Annuaire des comptes de la plateforme (API).
 *
 * Réservé au super administrateur. Cette route sert les clients authentifiés
 * par jeton Bearer ; l'interface web passe par les server actions de
 * `/admin/utilisateurs`, qui appliquent les mêmes règles.
 */
export async function GET(request: NextRequest) {
  const denied = denyUnlessSuperAdminApi(request);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search")?.trim();
    const role = searchParams.get("role");
    const status = searchParams.get("status");

    const where = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
      ...(role ? { role: role as AppRole } : {}),
      ...(status
        ? { status: status as "ACTIVE" | "INACTIVE" | "SUSPENDED" }
        : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          createdAt: true,
          passwordHash: true,
          _count: { select: { tickets: true, clients: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      data: {
        items: users.map((user) => ({
          ...toItem(user),
          roleLabel: ROLE_LABEL[user.role],
          ticketCount: user._count.tickets,
          zoneOwnerCount: user._count.clients,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des utilisateurs" },
      { status: 500 }
    );
  }
}

function toItem(user: {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  role: keyof typeof ROLE_LABEL;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  createdAt: Date;
  passwordHash: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    hasPassword: user.passwordHash !== null,
  };
}

/** Création d'un compte par le super administrateur. */
export async function POST(request: NextRequest) {
  const denied = denyUnlessSuperAdminApi(request);
  if (denied) return denied;

  try {
    const result = await createUser(await request.json());

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      { data: { ...result.data, roleLabel: ROLE_LABEL[result.data.role] } },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ce numéro de téléphone est déjà utilisé" },
        { status: 409 }
      );
    }

    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du compte" },
      { status: 500 }
    );
  }
}

export type { PublicUser };
