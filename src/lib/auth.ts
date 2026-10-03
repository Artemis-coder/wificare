import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { encode, type JWT } from "next-auth/jwt";
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
 * Durée d'une session « rester connecté », en secondes.
 *
 * Un jeton ne peut pas être éternel : un an est la plus longue durée que l'on
 * peut promettre sans qu'un jeton volé sur un poste de régie reste valable
 * indéfiniment. En pratique, la session survit à la fermeture du navigateur,
 * aux week-ends et aux vacances, et ne s'arrête que sur une déconnexion ou une
 * année plus tard.
 */
const REMEMBERED_MAX_AGE = 365 * 24 * 60 * 60;

/**
 * Durée d'une session ordinaire : une journée de travail.
 *
 * Sans « rester connecté », le cookie de session reste dans le navigateur
 * jusqu'à sa date d'expiration — NextAuth écrit toujours la même durée — mais le
 * jeton qu'il contient, lui, expire. C'est le jeton qui fait foi : le cookie
 * restant est ignoré puis remplacé à la prochaine connexion.
 */
const ORDINARY_MAX_AGE = 12 * 60 * 60;

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
  /** Case « rester connecté » : le client l'envoie, le serveur en tient compte. */
  remember?: boolean | string;
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
    /** Session demandée comme durable par l'écran de connexion. */
    remember?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: AppRole;
    phone: string;
    /** Session durable : elle se renouvelle d'elle-même jusqu'à la déconnexion. */
    remember?: boolean;
    /** Secondes écoulées depuis 1970 où une session ordinaire prend fin. */
    until?: number;
  }
}

/**
 * Une case à cocher arrive selon la forme du formulaire qui l'a envoyée : un
 * booléen depuis `signIn`, « on » ou « true » depuis un envoi HTML.
 */
function wantsRemember(value: boolean | string | undefined): boolean {
  return value === true || value === "on" || value === "true";
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
        const { phone, password, accountType, remember } = (credentials ?? {}) as Credentials;

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
          remember: wantsRemember(remember),
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // La durée du cookie est celle d'une session durable : c'est la plus longue
    // des deux, et le jeton qu'il contient décide de ce qui expire vraiment.
    maxAge: REMEMBERED_MAX_AGE,
    // Une session durable se renouvelle tant que le poste est utilisé, sans
    // jamais s'arrêter avant un an.
    updateAge: 24 * 60 * 60,
  },
  jwt: {
    /**
     * Durée propre à chaque session.
     *
     * NextAuth n'écrit qu'une durée de cookie pour tout le monde, mais il
     * délègue l'écriture du jeton : c'est ici que la case « rester connecté »
     * trouve son effet. Une session ordinaire porte l'heure exacte de sa fin,
     * ce qui l'empêche de glisser d'une journée à chaque rafraîchissement ; une
     * session durable repart de son année complète, donc ne s'arrête jamais
     * tant que le compte reste utilisé puis déconnecté volontairement.
     */
    encode: async ({ token, ...params }) => {
      const now = Math.floor(Date.now() / 1000);
      const claims = (token ?? {}) as JWT;

      const maxAge = claims.remember
        ? REMEMBERED_MAX_AGE
        : Math.max(0, (claims.until ?? now) - now);

      return encode({ ...params, token: claims, maxAge });
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.phone = user.phone;
        token.remember = user.remember === true;
        token.until = user.remember
          ? undefined
          : Math.floor(Date.now() / 1000) + ORDINARY_MAX_AGE;
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
