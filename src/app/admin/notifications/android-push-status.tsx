/**
 * État du push Android, tel que le serveur le voit.
 *
 * Un message envoyé depuis cette console est écrit en base et c'est tout : le
 * serveur peut n'avoir aucun secret Firebase, et l'envoi se termine alors sans
 * erreur, sans avertissement, avec la seule notification in-app en guise de
 * preuve. C'est le silence le plus coûteux de la console — la régie croit avoir
 * prévenu des personnes qui n'ont rien reçu.
 *
 * L'état est donc affiché, y compris quand il est mauvais.
 */
export default function AndroidPushStatus({
  configured,
  subscribedAccounts,
  totalAccounts,
}: {
  configured: boolean;
  subscribedAccounts: number;
  totalAccounts: number;
}) {
  return (
    <div
      className="data-table-wrapper"
      style={{ marginTop: '24px', borderLeft: `3px solid ${configured ? 'var(--success-600)' : 'var(--warning-600, #b45309)'}` }}
    >
      <div style={{ padding: '20px 24px' }}>
        <h3 style={{ margin: '0 0 4px' }}>Téléphones Android</h3>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            color: configured ? 'var(--success-600)' : 'var(--warning-600, #b45309)',
            fontWeight: 600,
          }}
        >
          {configured
            ? 'Push actif — les messages sonnent sur le téléphone, application fermée.'
            : 'Push inactif — les messages restent dans l’application.'}
        </p>

        <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          {configured
            ? `${subscribedAccounts} compte${subscribedAccounts > 1 ? 's' : ''} sur ${totalAccounts} actif${totalAccounts > 1 ? 's' : ''} ${subscribedAccounts > 1 ? 'ont' : 'a'} un téléphone abonné.${subscribedAccounts < totalAccounts ? ' Les autres ne seront prévenus qu’en ouvrant l’application.' : ''}`
            : 'Le serveur n’a pas le secret de service Firebase. Sans lui, aucun téléphone n’est touché : le message est bien enregistré, et visible uniquement dans l’application. Voir FIREBASE_SERVICE_ACCOUNT.'}
        </p>
      </div>
    </div>
  );
}