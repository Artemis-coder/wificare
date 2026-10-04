"use client";

import { signIn } from "next-auth/react";
import posthog from "posthog-js";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { LOGIN_ERROR_MESSAGE } from "@/lib/auth";
import {
  DEFAULT_COUNTRY_CODE,
  countryByCode,
  expectedDigitsLabel,
  splitInternationalNumber,
  validateNationalNumber,
  type PhoneCountry,
} from "@/lib/phone-countries";
import { PASSWORD_LENGTH } from "@/lib/roles";
import CountrySelect from "./country-select";

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
 *
 * Le numéro se saisit avec son pays, parce qu'un numéro n'a de sens qu'avec le
 * plan de numérotation qui le reconnaît : `07 07 07 07 07` est un numéro
 * ivoirien, dix chiffres de trop ailleurs. La vérification vient de
 * `lib/phone-countries`, la même qui sert à l'application mobile.
 */
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);

  // Après un changement de mot de passe, le formulaire renvoie ici pour que la
  // personne se reconnecte avec le nouveau. Sans ce bandeau, elle arrive devant
  // un écran qui ne lui dit rien et finit par essayer l'ancien mot de passe,
  // qu'elle croit avoir changé. Lu dans l'URL et non gardé en état : il n'a pas
  // à survivre à une action de l'utilisateur.
  const passwordChanged = searchParams.get("changed") === "1";

  const country = countryByCode(countryCode);

  const chooseCountry = (code: string) => {
    setCountryCode(code);
    // Le plan change avec le pays : le message de longueur de l'ancien pays
    // n'a plus de sens, et le laisser afficher enverrait l'utilisateur vers une
    // erreur qui ne le concerne plus.
    setPhoneError("");
  };

  /**
   * Un numéro collé depuis une carte SIM ou un message arrive avec son
   * indicatif, et cet indicatif dit son pays mieux que le sélecteur ne le
   * suppose : on suit le numéro collé au lieu de le plaquer dans le pays choisi.
   */
  const adoptPastedNumber = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").trim();

    if (!pasted.startsWith("+") && !pasted.startsWith("00")) return;

    const split = splitInternationalNumber(pasted);

    if (!split.digits) return;

    event.preventDefault();
    setCountryCode(split.country.code);
    setPhone(split.digits.replace(/\D/g, ""));
    setPhoneError("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError("");
    setPasswordError("");

    if (!phone || !password) {
      if (!phone) setPhoneError("Saisissez votre numéro de téléphone.");
      if (!password) setPasswordError("Saisissez votre mot de passe.");
      return;
    }

    const validation = validateNationalNumber(country, phone);

    if (!validation.ok) {
      setPhoneError(validation.message);
      return;
    }

    setLoading(true);

    const result = await signIn("credentials", {
      phone: validation.e164,
      password,
      remember,
      redirect: false,
    });

    if (result?.error) {
      // `result.error` porte le code renvoyé par `authorize` (voir
      // LoginRejected dans lib/auth.ts).
      const code = decodeURIComponent(result.error);

      // Le motif du refus est enregistré tel que `authorize` l'a nommé, sans le
      // numéro ni le mot de passe : savoir *pourquoi* une connexion échoue
      // (mot de passe erroné, compte inactif, mauvais produit) est ce qui
      // permet de distinguer un lot de fautes de frappe d'un compte bloqué.
      captureLogin(code, false, remember);

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

    captureLogin("success", true, remember);

    router.push("/");
    router.refresh();
  };

  return (
    <div className="login-shell">
      <div className="login-card">
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
          {passwordChanged && (
            <div role="status" className="alert alert-success">
              Mot de passe modifié. Connectez-vous avec le nouveau.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="phone">Numéro de téléphone</label>
            <div className="phone-row">
              <CountrySelect
                value={countryCode}
                onChange={chooseCountry}
                disabled={loading}
              />
              <input
                id="phone"
                className="field phone-number"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder={country.example}
                value={phone}
                onPaste={adoptPastedNumber}
                onChange={(event) => {
                  setPhone(event.target.value.replace(/\D/g, ""));
                  if (phoneError) setPhoneError("");
                }}
                aria-invalid={Boolean(phoneError)}
                style={phoneError ? { borderColor: 'var(--error-600)' } : undefined}
                required
              />
            </div>
            {phoneError ? (
              <span style={{ fontSize: '12px', color: 'var(--error-600)' }}>{phoneError}</span>
            ) : (
              <PhoneHint country={country} digits={phone} />
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
              className="field"
              style={passwordError ? { borderColor: 'var(--error-600)' } : undefined}
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

          {/* Le libellé est frère de la case et non son parent : un `<label>`
              qui enveloppe sa propre case renvoie l'activation à la case, qui se
              retourne deux fois et reste dans son état initial. */}
          <div className="check-row">
            <input
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              disabled={loading}
            />
            <label htmlFor="remember">Rester connecté sur ce poste</label>
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
          Mode démo : <strong>09 09 09 09 09</strong> (Côte d&apos;Ivoire) — mot de passe <strong>1234</strong>
        </div>
      </div>
    </div>
  );
}

/**
 * Rappel de la forme attendue, une fois le pays choisi.
 *
 * Le compte se fait pendant la saisie : afficher « 10 / 10 chiffres » dès le
 * départ laisserait croire que le champ est déjà complet, et ne rien afficher
 * obligerait l'utilisateur à compter ses chiffres un par un.
 */
function PhoneHint({ country, digits }: { country: PhoneCountry; digits: string }) {
  const remaining = country.lengths[0] - digits.length;

  return (
    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
      {remaining > 0 && digits.length > 0 ? `encore ${remaining} chiffre${remaining > 1 ? 's' : ''} · ` : ''}
      {expectedDigitsLabel(country)} · ex. {country.example}
    </span>
  );
}

/**
 * Enregistre une tentative de connexion.
 *
 * Le motif est envoyé séparément de l'événement lui-même : une série de refus
 * pour un même motif se lit alors d'un coup d'œil, là où il faudrait énumérer
 * tous les échecs pour retrouver le même motif. Le numéro et le mot de passe ne
 * sont jamais transmis — un mot de passe dans PostHog y resterait pour toujours.
 */
function captureLogin(outcome: string, success: boolean, remember: boolean): void {
  if (!posthog.__loaded) return;

  posthog.capture('login_attempted', { outcome, success, remembered: remember });
}