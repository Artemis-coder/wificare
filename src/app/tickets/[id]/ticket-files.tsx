/**
 * Pièces jointes d'une demande, en lecture.
 *
 * Ce que le client a photographié en signalant sa panne est la première chose
 * que la régie cherche en cas de réclamation : un boîtier qui n'alimente plus,
 * un câble débranché, un voyant éteint. La colonne n'était pas sélectionnée par
 * la page, donc ces photos n'existaient que sur le téléphone du technicien — et
 * seulement si l'envoi était passé, ce qui n'était jamais le cas.
 *
 * Chaque vignette ouvre la pièce en pleine taille : une photo de panne se juge
 * sur le détail, pas sur une vignette de cent pixels.
 */

type TicketFile = {
  id: string;
  url: string;
  fileType: string;
  size: number | null;
  createdAt: Date;
};

function formatSize(bytes: number | null): string {
  if (bytes === null) return '';

  if (bytes < 1024) return `${bytes} o`;

  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const FILE_LABEL: Record<string, string> = {
  IMAGE: 'Photo',
  VIDEO: 'Vidéo',
  AUDIO: 'Audio',
  DOCUMENT: 'Document',
};

export default function TicketFiles({ files }: { files: TicketFile[] }) {
  if (files.length === 0) {
    return null;
  }

  const photos = files.filter((file) => file.fileType === 'IMAGE');
  const others = files.filter((file) => file.fileType !== 'IMAGE');

  return (
    <div className="panel">
      <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>
        Pièces jointes ({files.length})
      </h3>

      {photos.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '12px',
          }}
        >
          {photos.map((file) => (
            <a
              key={file.id}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'block',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--border-default)',
                textDecoration: 'none',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- l'adresse
                  est une route qui rend des octets servis avec un cache long :
                  l'optimiseur d'image de Next la téléchargerait pour la
                  réencoder, sans rien gagner ici. */}
              <img
                src={file.url}
                alt="Pièce jointe de la demande"
                loading="lazy"
                style={{
                  display: 'block',
                  width: '100%',
                  height: '140px',
                  objectFit: 'cover',
                  backgroundColor: 'var(--neutral-50)',
                }}
              />
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {formatSize(file.size)} ·{' '}
                  {new Date(file.createdAt).toLocaleDateString('fr-FR')}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: photos.length > 0 ? '16px' : 0 }}>
          {others.map((file) => (
            <a
              key={file.id}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--neutral-50)',
                fontSize: '13px',
                color: 'var(--text-primary)',
                textDecoration: 'none',
              }}
            >
              <span>
                {FILE_LABEL[file.fileType] ?? 'Fichier'}
                {formatSize(file.size) ? ` · ${formatSize(file.size)}` : ''}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>Ouvrir</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
