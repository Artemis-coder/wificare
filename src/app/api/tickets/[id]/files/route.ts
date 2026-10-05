import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { FileType } from "@prisma/client";
import { compressImage, shouldCompress } from "@/lib/images";

/**
 * Taille maximale acceptée pour **un** fichier, telle qu'elle arrive.
 *
 * La limite est posée sur l'entrée et non sur la sortie : elle borne ce que le
 * serveur accepte de recevoir, donc ce qu'un client malveillant peut lui faire
 * garder en mémoire. La compression vient après, et ramène un fichier de 8 Mo à
 * quelques centaines de kilo-octets.
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Nombre de fichiers acceptés par envoi. */
const MAX_FILES_PER_REQUEST = 8;

/**
 * Garde-fou sur ce qui est conservé en base.
 *
 * Les octets vivent en base (voir le modèle `File`) : ce qu'un téléphone n'arrive
 * pas à compresser ne doit pas non plus peser sur la base. Au-delà, le fichier est
 * refusé — il est en général une capture mal déclarée, pas une preuve.
 */
const MAX_STORED_SIZE = 2 * 1024 * 1024;

/** Signatures de format d'image, lues sur les octets. */
const IMAGE_SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  {
    mime: "image/png",
    ext: "png",
    test: (b) => b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG",
  },
  {
    mime: "image/jpeg",
    ext: "jpg",
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/gif",
    ext: "gif",
    test: (b) => b.length > 6 && b.subarray(0, 3).toString("latin1") === "GIF",
  },
  {
    mime: "image/webp",
    ext: "webp",
    test: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

type Detected = { mime: string; ext: string; fileType: FileType };

/**
 * Ce que sont réellement les octets reçus.
 *
 * Le type est déduit des **octets**, et non du `Content-Type` annoncé : celui-ci
 * vient du client. Une image étiquetée `application/octet-stream` entrait
 * jusqu'ici en base comme une pièce jointe quelconque — donc sans compression,
 * et servie sans type que le navigateur sache afficher. C'est le format qui décide
 * de ce que l'écran montrera, donc c'est lui qu'on mesure.
 *
 * Les vidéos et les audios gardent le type déclaré : leur signature n'est pas
 * vérifiée ici, et un type faux sur une vidéo se voit tout de suite — quand elle
 * ne se lance pas. Une image dont la signature n'est pas reconnue perd son type
 * d'image : mieux vaut la déclarer incompréhensible que de l'afficher en cassé.
 */
function detect(buffer: Buffer, declaredMime: string): Detected {
  for (const signature of IMAGE_SIGNATURES) {
    if (signature.test(buffer)) {
      return { mime: signature.mime, ext: signature.ext, fileType: FileType.IMAGE };
    }
  }

  if (declaredMime.startsWith("video/")) {
    return { mime: declaredMime, ext: "bin", fileType: FileType.VIDEO };
  }

  if (declaredMime.startsWith("audio/")) {
    return { mime: declaredMime, ext: "bin", fileType: FileType.AUDIO };
  }

  return {
    mime: "application/octet-stream",
    ext: "bin",
    fileType: FileType.DOCUMENT,
  };
}

/**
 * Upload de pièces jointes (photos de panne, preuves d'intervention, preuves de
 * paiement). Multipart/form-data, champ de fichier `files` (plusieurs fichiers).
 *
 * Les octets sont écrits **en base**, pas dans le système de fichiers de
 * l'application. Un fichier déposé dans `public/uploads` n'existe que le temps de
 * l'instance qui l'a écrit : sur un hébergeur à instances éphémères, il disparaît
 * au redémarrage suivant, et l'écriture échoue purement et simplement parce que le
 * disque est en lecture seule. La demande était alors créée sans sa photo, sans trace de
 * l'échec, et le client ne le’apprenait que par un message qu’il pouvait manquer.
 * La base n'a pas cette limite : elle survit à l'instance, et c'est elle qui
 * décide si la photo existe.
 *
 * Les images passent par `lib/images`, qui applique la règle de compression.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getApiUser(request);
    if (!auth) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
    }

    if (auth.role === "CLIENT" && ticket.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: ticket.clientId },
      });
      if (client?.userId && client.userId !== auth.userId) {
        return NextResponse.json(
          { error: "Vous n'êtes pas autorisé à joindre des fichiers à ce ticket" },
          { status: 403 }
        );
      }
    }

    const formData = await request.formData();
    const entries = formData.getAll("files").filter((v): v is File => v instanceof File);

    if (entries.length === 0) {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }

    // Le nombre est vérifié avant tout traitement : dix fichiers de dix
    // mégaoctets se chargeraient en mémoire avant d'être refusés, compressés ou
    // non.
    if (entries.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        {
          error: `Au maximum ${MAX_FILES_PER_REQUEST} fichiers par envoi (${entries.length} reçus)`,
        },
        { status: 413 }
      );
    }

    const created = [];
    let savedBytes = 0;
    const originalBytes = [];

    for (const entry of entries) {
      if (entry.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `Le fichier ${entry.name} dépasse 10 Mo` },
          { status: 413 }
        );
      }

      const buffer = Buffer.from(await entry.arrayBuffer());
      originalBytes.push(buffer.length);

      const detected = detect(buffer, entry.type || "");

      // Seules les images sont recompressées : une vidéo ou un document passé
      // par `sharp` serait refusé sans raison.
      const stored =
        detected.fileType === FileType.IMAGE && shouldCompress(buffer.length)
          ? await compressImage(buffer, detected.ext)
          : { buffer, extension: detected.ext, compressed: false };

      if (stored.buffer.length > MAX_STORED_SIZE) {
        return NextResponse.json(
          {
            error:
              `Le fichier ${entry.name} fait ${formatBytes(stored.buffer.length)} ` +
              `après compression : au maximum ${formatBytes(MAX_STORED_SIZE)}.`,
          },
          { status: 413 }
        );
      }

      savedBytes += stored.buffer.length;

      // La compression sort en JPEG : c'est ce que le navigateur va décoder,
      // pas le format d'origine. Dire `image/png` au-dessus d'octets JPEG
      // produirait une image refusée à l'affichage.
      const mimeType = stored.compressed ? "image/jpeg" : detected.mime;

      const fileId = randomUUID();

      const file = await prisma.file.create({
        data: {
          id: fileId,
          ticketId: id,
          url: `/api/files/${fileId}`,
          fileType: detected.fileType,
          content: stored.buffer,
          mimeType,
          size: stored.buffer.length,
        },
        // La réponse décrit la pièce, jamais la redonne : une image de deux
        // mégaoctets encodée dans le JSON ferait peser la réponse du même poids
        // que le fichier, pour rien.
        select: { id: true, url: true, fileType: true, mimeType: true, size: true },
      });

      created.push(file);
    }

    // La compression n'est visible que si elle est mesurée. Ce résumé n'est pas
    // renvoyé au client, mais il dit dans les journaux ce que la règle a
    // réellement coûté — la seule mesure qui dise si elle est encore utile.
    const before = originalBytes.reduce((sum, size) => sum + size, 0);

    console.info(
      `[uploads] ${created.length} fichier(s) — ${formatBytes(before)} reçus, ${formatBytes(savedBytes)} conservés`
    );

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("Upload files error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi des fichiers" },
      { status: 500 }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
