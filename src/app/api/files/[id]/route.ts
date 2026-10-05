import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Rend les octets d'une pièce jointe.
 *
 * Les fichiers vivent en base (modèle `File`), et `url` pointe ici plutôt que
 * vers un dossier de l'hébergement : un fichier écrit sur le disque d'une
 * instance n'existe que le temps de cette instance.
 *
 * **Pas d'authentification, et c'est délibéré.** L'adresse est un UUID : elle
 * n'est pas devinable, et c'est exactement le modèle qui prévalait tant que les
 * fichiers étaient déposés dans `public/uploads`, également accessibles à
 * quiconque avait l'adresse. Exiger un jeton ici obligerait à envoyer un
 * en-tête `Authorization` sur chaque affichage d'image — sur l'application, où
 * une image oubliée est une image cassée, et sur le back-office. Le jour où ces
 * photos sont jugées sensibles, le passage à des adresses signées à durée de vie
 * courte se fait ici, en un seul endroit.
 */

/** Un fichier dont on ne connaît pas le type est renvoyé comme tel. */
const FALLBACK_MIME = "application/octet-stream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const file = await prisma.file.findUnique({
    where: { id },
    select: { content: true, mimeType: true, fileType: true },
  });

  // Une ligne sans octets est une référence morte : un envoi d'une version
  // antérieure, ou une pièce restée sur un hébergeur précédent. Répondre 404
  // est plus honnête qu'une image vide — et l'appelant sait alors qu'il n'y a
  // rien à afficher.
  if (!file?.content) {
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  }

  const body = new Uint8Array(file.content);

  return new Response(body, {
    headers: {
      "Content-Type": file.mimeType || FALLBACK_MIME,
      "Content-Length": String(body.byteLength),
      // Les octets d'un fichier donné ne changent jamais : le cache du téléphone
      // comme celui du navigateur peuvent les garder sans risque, et un
      // technicien en connexion faible ne les retéléchargera pas à chaque
      // ouverture d'une demande.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
