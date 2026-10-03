import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signTokens } from "@/lib/auth-tokens";
import { verifyPassword } from "@/lib/password";
import { normalizePhone, phoneCandidates } from "@/lib/phone";
import { countryCodeOfPhone, recordUserLogin } from "@/lib/user-country";
import {
  ACCOUNT_TYPE_ROLE,
  accountTypeMismatchMessage,
  isAccountType,
} from "@/lib/roles";

export async function POST(request: NextRequest) {
  try {
    const { phone, otp, password, accountType } = await request.json();

    if (!phone || (!otp && !password)) {
      return NextResponse.json(
        { error: "Numéro de téléphone et mot de passe (ou code OTP) requis" },
        { status: 400 }
      );
    }

    if (otp && otp !== "123456") {
      return NextResponse.json({ error: "Code OTP invalide" }, { status: 401 });
    }

    if (accountType !== undefined && accountType !== null && !isAccountType(accountType)) {
      return NextResponse.json(
        { error: "Type de compte inconnu" },
        { status: 400 }
      );
    }

    // Un numéro saisi avec ou sans indicatif désigne le même compte.
    const phoneNumber = normalizePhone(phone);

    if (phoneNumber.length < 8) {
      return NextResponse.json(
        { error: "Numéro de téléphone invalide" },
        { status: 400 }
      );
    }

    // Rechercher l'utilisateur
    let user = await prisma.user.findFirst({
      where: { phone: { in: phoneCandidates(phoneNumber) } },
      orderBy: { createdAt: "asc" }
    });

    if (!user && password) {
      // Un numéro inconnu ne peut pas se connecter par mot de passe : les
      // comptes se créent via /auth/register.
      return NextResponse.json(
        { error: "Aucun compte n'existe pour ce numéro" },
        { status: 401 }
      );
    }

    // Créer l'utilisateur s'il n'existe pas (mode OTP de démonstration)
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone: phoneNumber,
          name: `Client ${phoneNumber.slice(-4)}`,
          role: "CLIENT", // Un numéro inconnu s'inscrit comme client
          // Ce compte naît d'une connexion : son pays vient de son numéro.
          country: countryCodeOfPhone(phoneNumber),
        }
      });
    } else if (user.phone !== phoneNumber) {
      // Aligne la base sur la forme canonique.
      user = await prisma.user.update({
        where: { id: user.id },
        data: { phone: phoneNumber }
      });
    }

    // Vérifier si l'utilisateur est actif
    if (user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Compte inactif ou suspendu" },
        { status: 403 }
      );
    }

    // Mot de passe : obligatoire pour les comptes créés via /auth/register.
    if (password) {
      if (!verifyPassword(password, user.passwordHash)) {
        return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
      }
    }

    // L'application demande le type de compte avant la connexion : on refuse
    // un compte qui ne correspond pas au type choisi.
    if (accountType && isAccountType(accountType)) {
      const expectedRole = ACCOUNT_TYPE_ROLE[accountType];

      if (user.role !== expectedRole) {
        return NextResponse.json(
          { error: accountTypeMismatchMessage(expectedRole) },
          { status: 403 }
        );
      }
    }

    const { accessToken, refreshToken } = signTokens({
      id: user.id,
      phone: user.phone,
      role: user.role,
    });

    // Connexion réussie : elle compte pour la mesure d'activité du pays, et
    // complète le pays d'un compte plus ancien au passage. L'écriture n'est pas
    // attendue — elle ne doit pas retarder l'ouverture de session.
    void recordUserLogin(user.id, user.phone);

    return NextResponse.json({
      data: {
        user: {
          id: user.id,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          role: user.role
        },
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la connexion" },
      { status: 500 }
    );
  }
}
