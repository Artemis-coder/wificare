import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { verifyPassword } from "./password";
import { normalizePhone, phoneCandidates } from "./phone";
import {
  ACCOUNT_TYPE_ROLE,
  canUseBackoffice,
  type AccountType,
  type AppRole,
  isAccountType,
} from "./roles";

/**
 * Formulaire de connexion : téléphone, mot de passe de 4 chiffres et type de
 * compte. Le type de compte n'est pas une information fiable côté client : le
 * serveur le compare au rôle réel et refuse la connexion s'il diffère, pour
 * qu'un compte technicien ne puisse pas se connecter depuis l'espace client.
 */
export type Credentials = {
  phone?: string;
  password?: string;
  accountType?: string;
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      phone: string;
      role: AppRole;
    };
  }

  interface User {
    id: string;
    phone: string;
    role: AppRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: AppRole;
    phone: string;
  }
}

/**
 * Refus d'authentification.
 *
 * NextAuth ne propage au client que le texte du query paramètre `error`, et il
 * construit ce paramètre avec `error.message`. Lever une erreur porteuse d'un
 * code permet donc à l'écran de connexion d'afficher le motif réel du refus au
 * lieu d'un « identifiants incorrects » qui ne distingue pas un numéro inconnu
 * d'un mot de passe erroné.
 */
export class LoginRejected extends Error {
  constructor(readonly code: keyof typeof LOGIN_ERROR_MESSAGE) {
    super(code);
    this.name = "LoginRejected";
  }
}

/** Libellés affichés pour chaque refus d'authentification. */
export const LOGIN_ERROR_MESSAGE = {
  CredentialsSignin: "Numéro de téléphone ou mot de passe incorrect.",
  missing: "Renseignez votre numéro et votre mot de passe.",
  unknown: "Aucun compte n'existe pour ce numéro.",
  inactive: "Ce compte est inactif ou suspendu.",
  badpassword: "Mot de passe incorrect.",
  badtype: "Type de compte inconnu.",
  mismatch: "Ce compte ne correspond pas au type de compte choisi.",
  notstaff:
    "Le back-office est réservé à la régie. Utilisez l'application mobile WiFiCare.",
  AccessDenied: "Accès refusé.",
} as const;

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Téléphone",
      credentials: {
        phone: {
          label: "Numéro de téléphone",
          type: "text",
          placeholder: "+2250102030405",
        },
        password: {
          label: "Mot de passe",
          type: "password",
          placeholder: "1234",
        },
        accountType: { label: "Type de compte", type: "text" },
      },
      async authorize(credentials) {
        const { phone, password, accountType } = (credentials ?? {}) as Credentials;

        if (!phone || !password) {
          throw new LoginRejected("missing");
        }

        const user = await prisma.user.findFirst({
          where: { phone: { in: phoneCandidates(normalizePhone(phone)) } },
          orderBy: { createdAt: "asc" },
        });

        if (!user) {
          throw new LoginRejected("unknown");
        }

        if (user.status !== "ACTIVE") {
          throw new LoginRejected("inactive");
        }

        if (!verifyPassword(password, user.passwordHash)) {
          throw new LoginRejected("badpassword");
        }

        // Le back-office est un outil de régie : il compte les comptes, répartit
        // les interventions et valide les zones. Un propriétaire de zone et un
        // technicien ont chacun leur espace dans l'application mobile, où se
        // trouve tout ce qui les concerne. Les laisser entrer ici ne leur
        // donnait qu'une seconde version de compteurs sur la plateforme
        // entière, et une navigation qui ne mène à aucun de leurs écrans.
        //
        // Le refus porte sur le rôle, jamais sur le type de compte annoncé : le
        // numéro et le mot de passe peuvent être parfaitement corrects, et c'est
        // précisément pour cela qu'il faut le dire autrement qu'« identifiants
        // incorrects ».
        if (!canUseBackoffice(user.role)) {
          throw new LoginRejected("notstaff");
        }

        if (accountType !== undefined && accountType !== "") {
          if (!isAccountType(accountType)) {
            throw new LoginRejected("badtype");
          }

          if (user.role !== ACCOUNT_TYPE_ROLE[accountType as AccountType]) {
            throw new LoginRejected("mismatch");
          }
        }

        return {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.phone = user.phone;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub ?? session.user.id;
        session.user.role = token.role;
        session.user.phone = token.phone;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
