import { NextResponse } from "next/server";

export async function POST() {
  // Dans une implémentation complète, on invaliderait le token côté serveur
  return NextResponse.json({
    data: { message: "Déconnexion réussie" }
  });
}
