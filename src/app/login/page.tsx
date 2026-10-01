"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { LOGIN_ERROR_MESSAGE } from "@/lib/auth";
import {
  ACCOUNT_TYPE_HINT,
  ACCOUNT_TYPE_LABEL,
  ACCOUNT_TYPES,
  PASSWORD_LENGTH,
  type AccountType,
} from "@/lib/roles";

/**
 * Connexion à l'application web.
 *
 * Le type de compte est choisi avant le numéro : le serveur refuse un compte qui
 * ne correspond pas, et l'erreur est alors rattachée au sélecteur. Sous le champ
 * mot de passe, elle laisserait croire à un mot de passe erroné.
 */
export default function LoginPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>("SUPER_ADMIN");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [accountTypeError, setAccountTypeError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError("");
    setPasswordError("");
    setAccountTypeError("");

    if (!phone || !password) {
      if (!phone) setPhoneError("Saisissez votre numéro de téléphone.");
      if (!password) setPasswordError("Saisissez votre mot de passe.");
      return;
    }

    setLoading(true);

    const result = await signIn("credentials", {
      phone,
      password,
      accountType,
      redirect: false,
    });

    if (result?.error) {
      // `result.error` porte le code renvoyé par `authorize` (voir
      // LoginRejected dans lib/auth.ts).
      const code = decodeURIComponent(result.error);
      const message = LOGIN_ERROR_MESSAGE[code as keyof typeof LOGIN_ERROR_MESSAGE]
        ?? LOGIN_ERROR_MESSAGE.CredentialsSignin;

      if (code === "mismatch" || code === "badtype") {
        setAccountTypeError(message);
      } else if (code === "unknown" || code === "missing") {
        setPhoneError(message);
      } else if (code === "inactive") {
        setAccountTypeError(message);
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

        {accountTypeError && (
          <div role="alert" style={{ backgroundColor: 'var(--error-50)', color: 'var(--error-600)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '14px' }}>
            {accountTypeError}
          </div>
        )}

        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 20px' }}>
          <legend className="label" style={{ marginBottom: '8px' }}>Type de compte</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {ACCOUNT_TYPES.map((type) => {
              const selected = type === accountType;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setAccountType(type);
                    setAccountTypeError('');
                  }}
                  disabled={loading}
                  aria-pressed={selected}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${selected ? 'var(--brand-600)' : 'var(--border-strong)'}`,
                    backgroundColor: selected ? 'var(--brand-50)' : 'var(--bg-primary)',
                    color: selected ? 'var(--brand-700)' : 'var(--text-primary)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 600 }}>
                    {ACCOUNT_TYPE_LABEL[type]}
                  </span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {ACCOUNT_TYPE_HINT[type]}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

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
          Mode démo : super administrateur <strong>2250909090909</strong>, administrateur <strong>2250505050505</strong>, technicien <strong>2250102030405</strong>, propriétaire <strong>2250707070707</strong> — mot de passe <strong>1234</strong>
        </div>
      </div>
    </div>
  );
}
