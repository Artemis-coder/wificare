import { NextRequest, NextResponse } from "next/server";
import { verify, sign } from "jsonwebtoken";

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "default-secret-key";

export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await request.json();

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Refresh token requis" },
        { status: 400 }
      );
    }

    // Vérifier le refresh token
    const decoded = verify(refreshToken, JWT_SECRET) as { userId: string; type: string };

    if (decoded.type !== "refresh") {
      return NextResponse.json(
        { error: "Token invalide" },
        { status: 401 }
      );
    }

    // Générer de nouveaux tokens
    const accessToken = sign(
      { userId: decoded.userId },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const newRefreshToken = sign(
      { userId: decoded.userId, type: "refresh" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return NextResponse.json({
      data: {
        accessToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return NextResponse.json(
      { error: "Token invalide ou expiré" },
      { status: 401 }
    );
  }
}
