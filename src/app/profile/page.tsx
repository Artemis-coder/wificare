import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth';

import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { canUseBackoffice, ROLE_LABEL, PASSWORD_LENGTH } from '@/lib/roles';
import { formatPhoneForDisplay } from '@/lib/phone-countries';
import { knownCountry } from '@/lib/user-country';
import { ChangePasswordForm } from './change-password-form';
import { SignOutButton } from './sign-out-button';

/**
 * Mon profil — la fiche du compte connecté.
 *
 * Cette page était écrite pour un propriétaire de zone : elle annonçait « vos
 * identifiants Wi-Fi Zone » et affichait un décompte de zones rattachées, qui
 * vaut toujours zéro pour la régie. Un administrateur n'a ni dossier client ni
 * emplacements — ce sont les notions du propriétaire — et la page lui montrait
 * donc des compteurs vides sous un vocabulaire qui n'était pas le sien.
 *
 * Elle montre ici ce qui décrit le compte et son activité : l'identité, le
 * numéro et le pays, l'activité, et la seule action qui lui appartient —
 * changer son propre mot de passe, impossible ailleurs. `lib/user-admin` refuse
 * l'auto-modification, et pour de bonnes raisons : voir `changeOwnPassword`.
 */

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  ACTIVE: 'Actif',
  INACTIVE: 'Inactif',
  SUSPENDED: 'Suspendu',
} as const;

/** Ce que vaut le rôle, en une phrase : un badge seul dit le nom, pas la portée. */
const ROLE_SCOPE: Record<string, string> = {
  SUPER_ADMIN:
    'Gère les comptes, les rôles et l’ensemble de la plateforme',
  TECHNICIAN: 'Traite les demandes d’intervention qui lui sont affectées',
  CLIENT: 'Suit ses demandes depuis l’application',
};

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
});

/** « aujourd'hui », « hier », « il y a 3 jours ». */
function since(then: Date): string {
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);

  if (days < 1) return 'aujourd’hui';
  if (days === 1) return 'hier';

  return `il y a ${days} jours`;
}

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Le back-office est réservé à la régie : un compte technicien ou
  // propriétaire n'y a pas d'espace et son compte n'y est pas connecté
  // (`lib/auth.ts` refuse sa connexion). Cette garde couvre le cas d'une
  // session antérieure à cette règle, ou d'un rôle changé depuis la
  // connexion — sans elle, la page resterait le seul endroit qui ne borne pas
  // ce qu'elle affiche.
  if (!canUseBackoffice(session.user.role)) {
    redirect('/login');
  }

  // La session porte l'identifiant du compte : la requête porte sur cet id, et
  // non sur le nom, qui n'est pas unique.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      status: true,
      country: true,
      loginCount: true,
      lastLoginAt: true,
      createdAt: true,
      passwordHash: true,
      _count: { select: { pushTokens: true, pushSubscriptions: true } },
    },
  });

  // Le compte a été supprimé entre la connexion et cette page : la session
  // reste valide, son porteur n'existe plus. Une fiche qui inventerait des
  // valeurs afficherait un profil pour quelqu'un qui n'a pas de compte.
  if (!user) {
    redirect('/login');
  }

  const country = knownCountry(user.country);
  const initial =
    user.name?.trim()[0] ?? user.firstName?.trim()[0] ?? user.phone.slice(-1);

  // Un compte créé par code n'a pas de nom. L'ancienne page tombait sur
  // « Détenteur Wi-Fi », qui décrit un propriétaire de zone, pas un
  // administrateur : mieux vaut le pays, puis les derniers chiffres du numéro.
  const displayName =
    user.name?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    country?.name ||
    `Compte ${user.phone.slice(-4)}`;

  const alertDevices = user._count.pushTokens + user._count.pushSubscriptions;

  return (
    <div className="profile-page">
      <div className="page-header">
        <div className="page-header-text">
          <h1>Mon profil</h1>
          <p className="body-m">
            Votre compte d&apos;administration, son activité et son mot de passe.
          </p>
        </div>
      </div>

      <section className="panel profile-card" aria-labelledby="profile-identity">
        <div className="profile-banner" aria-hidden="true" />

        <div className="profile-body">
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden="true">
              {initial.toUpperCase()}
            </span>

            <div className="profile-identity-text">
              <h2 id="profile-identity">{displayName}</h2>
              <div className="profile-meta">
                <span className="badge badge-purple">
                  <span className="badge-dot" />
                  {ROLE_LABEL[user.role]}
                </span>
                <span
                  className={`badge ${user.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}
                >
                  <span className="badge-dot" />
                  {STATUS_LABEL[user.status]}
                </span>
              </div>
              {ROLE_SCOPE[user.role] && (
                <p className="profile-scope">{ROLE_SCOPE[user.role]}</p>
              )}
            </div>
          </div>

          <div className="profile-details">
            <div className="profile-detail">
              <span className="label">Téléphone — votre identifiant</span>
              <span className="profile-detail-value">
                {country && (
                  <span className="profile-flag" aria-hidden="true">
                    {country.flag}
                  </span>
                )}
                {formatPhoneForDisplay(user.phone, user.country)}
              </span>
            </div>

            <div className="profile-detail">
              <span className="label">Pays de rattachement</span>
              {country ? (
                <span className="profile-detail-value">
                  {country.name}
                  <span className="profile-detail-note">{country.dialLabel}</span>
                </span>
              ) : (
                <span className="profile-detail-value">
                  <span className="profile-detail-note">
                    Non renseigné — il sera déduit de votre numéro à la prochaine
                    connexion
                  </span>
                </span>
              )}
            </div>

            <div className="profile-detail">
              <span className="label">Compte créé le</span>
              <span className="profile-detail-value">
                {DATE_FORMAT.format(user.createdAt)}
              </span>
            </div>

            <div className="profile-detail">
              <span className="label">Identifiant du compte</span>
              <span className="profile-detail-value profile-detail-ref">
                {user.id}
              </span>
              <span className="profile-detail-note">
                À communiquer au support : c&apos;est ce qui identifie votre compte
                autrement que par votre numéro.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel profile-panel" aria-labelledby="profile-activity">
        <h3 id="profile-activity">Activité</h3>

        <div className="profile-details">
          <div className="profile-detail">
            <span className="label">Dernière connexion</span>
            <span className="profile-detail-value">
              {user.lastLoginAt ? (
                <>
                  {DATE_TIME_FORMAT.format(user.lastLoginAt)}
                  <span className="profile-detail-note">
                    {since(user.lastLoginAt)}
                  </span>
                </>
              ) : (
                <span className="profile-detail-note">
                  Jamais mesurée — le suivi a commencé après la création de votre
                  compte
                </span>
              )}
            </span>
          </div>

          <div className="profile-detail">
            <span className="label">Connexions</span>
            <span className="profile-detail-value">
              {user.loginCount}
              <span className="profile-detail-note">
                depuis la mise en place du suivi, application et back-office
                confondus
              </span>
            </span>
          </div>

          <div className="profile-detail">
            <span className="label">Alertes sur ce poste</span>
            <span className="profile-detail-value">
              {alertDevices}
              <span className="profile-detail-note">
                appareil{alertDevices > 1 ? 's' : ''} abonné
                {alertDevices > 1 ? 's' : ''} aux notifications
              </span>
            </span>
          </div>
        </div>
      </section>

      <section className="panel profile-panel" aria-labelledby="profile-security">
        <h3 id="profile-security">Mot de passe</h3>

        {user.passwordHash ? (
          <>
            <p className="profile-panel-lead">
              Votre mot de passe comporte {PASSWORD_LENGTH} chiffres.
            </p>
            <ChangePasswordForm />
          </>
        ) : (
          <>
            <p className="profile-panel-lead">
              Ce compte n&apos;a pas de mot de passe : il se connecte par code.
            </p>
            <p className="profile-note">
              Un mot de passe se définit depuis la page des comptes.
            </p>
          </>
        )}
      </section>

      <div className="profile-footer">
        <SignOutButton />
      </div>
    </div>
  );
}