"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      phone,
      otp,
      redirect: false,
    });

    if (result?.error) {
      setError("Numéro de téléphone ou code OTP incorrect.");
      setLoading(false);
    } else {
      router.push("/");
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-secondary)' }}>
      <div style={{ backgroundColor: 'var(--bg-primary)', padding: '40px', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--elevation-3)', width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--brand-600)', fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            WiFiCare
          </div>
          <h2>Connexion</h2>
          <p className="body-m" style={{ color: 'var(--text-secondary)' }}>Accédez à votre espace administrateur</p>
        </div>

        {error && (
          <div style={{ backgroundColor: 'var(--error-50)', color: 'var(--error-600)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '24px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className="label" htmlFor="phone">Numéro de téléphone</label>
            <input 
              id="phone"
              type="text" 
              placeholder="+2250102030405" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ height: '44px', padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: '16px', outline: 'none' }}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="label" htmlFor="otp">Code OTP</label>
              <span style={{ fontSize: '12px', color: 'var(--brand-600)', cursor: 'pointer' }}>Envoyer un code</span>
            </div>
            <input 
              id="otp"
              type="password" 
              placeholder="123456 (Code de test)" 
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              style={{ height: '44px', padding: '0 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-strong)', fontSize: '16px', outline: 'none' }}
              required
            />
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
          Mode démo: Numéro <strong>+2250505050505</strong> (Admin) et code <strong>123456</strong>
        </div>
      </div>
    </div>
  );
}
