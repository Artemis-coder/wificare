import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getApiUser } from "@/lib/api-auth";
import { FileType } from "@prisma/client";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const created = [];

    for (const entry of entries) {
      if (entry.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `Le fichier ${entry.name} dépasse 10 Mo` },
          { status: 413 }
        );
      }

      const storedName = `${randomUUID()}.${sanitizeExtension(entry.name)}`;
      const buffer = Buffer.from(await entry.arrayBuffer());

      await fs.writeFile(path.join(UPLOAD_DIR, storedName), buffer);

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

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("Upload files error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi des fichiers" },
      { status: 500 }
    );
  }
}
