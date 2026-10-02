"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { LOGIN_ERROR_MESSAGE } from "@/lib/auth";
import { PASSWORD_LENGTH } from "@/lib/roles";

/**
 * Connexion au back-office de régie.
 *
 * Le back-office n'appartient qu'à la régie : le technicien et le propriétaire
 * de zone ont leur espace dans l'application mobile, et le serveur refuse leur
 * connexion ici (`lib/auth.ts`). Le sélecteur de type de compte a donc
 * disparu — il ne restait qu'une valeur possible, et un bouton unique qui ne
 * choisit rien est un contrôle qui laisse croire à un choix.
 *
 * Le refus « réservé à la régie » est rendu sous le numéro, et non sous le mot
 * de passe : les identifiants sont alors parfaitement corrects, et c'est le
 * rôle qui est en cause.
 */
export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError("");
    setPasswordError("");

    if (!phone || !password) {
      if (!phone) setPhoneError("Saisissez votre numéro de téléphone.");
      if (!password) setPasswordError("Saisissez votre mot de passe.");
      return;
    }

    setLoading(true);

    const result = await signIn("credentials", {
      phone,
      password,
      redirect: false,
    });

    if (result?.error) {
      // `result.error` porte le code renvoyé par `authorize` (voir
      // LoginRejected dans lib/auth.ts).
      const code = decodeURIComponent(result.error);
      const message = LOGIN_ERROR_MESSAGE[code as keyof typeof LOGIN_ERROR_MESSAGE]
        ?? LOGIN_ERROR_MESSAGE.CredentialsSignin;

      if (code === "notstaff" || code === "inactive") {
        setPhoneError(message);
      } else if (code === "unknown" || code === "missing") {
        setPhoneError(message);
      } else {
        setPasswordError(message);
      }

      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-secondary)', padding: '24px' }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', padding: '40px', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--elevation-3)', width: '100%', maxWidth: '460px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-wificare.png"
            alt="WiFiCare"
            width={96}
            height={96}
            style={{ display: 'block', margin: '0 auto 12px', borderRadius: 'var(--radius-xl)' }}
          />
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--brand-600)' }}>
            WiFiCare
          </div>
          <h2>Connexion</h2>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>Accédez à votre espace</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="phone">Numéro de téléphone</label>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              placeholder="+2250102030405"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError("");
              }}
              aria-invalid={Boolean(phoneError)}
              style={{ height: '44px', padding: '0 12px', borderRadius: 'var(--radius-md)', border: `1px solid ${phoneError ? 'var(--error-600)' : 'var(--border-strong)'}`, fontSize: '16px', outline: 'none' }}
              required
            />
            {phoneError && (
              <span style={{ fontSize: '12px', color: 'var(--error-600)' }}>{phoneError}</span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              inputMode="numeric"
              placeholder={'•'.repeat(PASSWORD_LENGTH)}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              aria-invalid={Boolean(passwordError)}
              style={{ height: '44px', padding: '0 12px', borderRadius: 'var(--radius-md)', border: `1px solid ${passwordError ? 'var(--error-600)' : 'var(--border-strong)'}`, fontSize: '16px', outline: 'none' }}
              required
            />
            {passwordError ? (
              <span style={{ fontSize: '12px', color: 'var(--error-600)' }}>{passwordError}</span>
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {PASSWORD_LENGTH} chiffres
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ marginTop: '8px', width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          Back-office de régie. Le technicien et le propriétaire de zone se connectent dans l&apos;application mobile.
          <br />
          Mode démo : <strong>2250909090909</strong> — mot de passe <strong>1234</strong>
        </div>
      </div>
    </div>
  );
}
