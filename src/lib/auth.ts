import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Téléphone",
      credentials: {
        phone: { label: "Numéro de téléphone", type: "text", placeholder: "+2250102030405" },
        otp: { label: "Code OTP", type: "password", placeholder: "123456" }
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.otp) return null;

        // Pour le MVP : On simule la vérification OTP avec "123456"
        if (credentials.otp !== "123456") return null;

        // Cherche l'utilisateur dans la base de données Neon
        const user = await prisma.user.findUnique({
          where: { phone: credentials.phone }
        });

        if (user) {
          return { id: user.id, name: user.name, phone: user.phone, role: user.role };
        }

        // Retourne null si l'utilisateur n'existe pas (il faut créer un compte)
        return null;
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.phone = (user as any).phone;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).role = token.role;
        (session.user as any).phone = token.phone;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  }
};
