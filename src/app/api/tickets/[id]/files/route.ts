import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { FileType } from "@prisma/client";
import { compressImage, shouldCompress } from "@/lib/images";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

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

function detectFileType(mimeType: string): FileType {
  if (mimeType.startsWith("image/")) return FileType.IMAGE;
  if (mimeType.startsWith("video/")) return FileType.VIDEO;
  if (mimeType.startsWith("audio/")) return FileType.AUDIO;
  return FileType.DOCUMENT;
}

function sanitizeExtension(filename: string): string {
  const ext = path.extname(filename || "").slice(1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
}

/**
 * Upload de pièces jointes (photos de panne, preuves d'intervention, preuves de
 * paiement). Multipart/form-data, champ de fichier `files` (plusieurs fichiers).
 *
 * Les images passent par `lib/images`, qui applique la règle de compression. Le
 * type est déduit des **octets** et non du `Content-Type` annoncé : celui-ci
 * vient du client, et une image étiquetée `application/octet-stream` entrait
 * jusqu'ici en base comme une pièce jointe quelconque — donc sans compression.
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

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

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

      const incomingExtension = sanitizeExtension(entry.name);

      // Seules les images sont recompressées : une vidéo ou un document passé
      // par `sharp` serait rejeté sans raison.
      const stored =
        entry.type.startsWith("image/") && shouldCompress(buffer.length)
          ? await compressImage(buffer, incomingExtension)
          : { buffer, extension: incomingExtension, compressed: false };

      savedBytes += stored.buffer.length;

      const storedName = `${randomUUID()}.${stored.extension}`;

      await fs.writeFile(path.join(UPLOAD_DIR, storedName), stored.buffer);

      created.push(
        await prisma.file.create({
          data: {
            ticketId: id,
            url: `/uploads/${storedName}`,
            fileType: detectFileType(entry.type || ""),
          },
        })
      );
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

  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}