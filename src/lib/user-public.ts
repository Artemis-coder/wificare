/**
 * Colonnes d'un compte exposées à l'API.
 *
 * `passwordHash` en fait partie, et c'est le seul champ de `User` qui ne doit
 * **jamais** sortir : l'empreinte est la moitié du secret d'un compte, et la
 * renvoyer à un client ou à un technicien permettrait de la casser hors ligne, à
 * l'abri du contrôle de tentatives.
 *
 * Toute inclusion d'un `User` dans une réponse passe donc par cette sélection.
 * Un `include: { technician: true }` écrit à la main est presque toujours le
 * même oubli : la relation est utile, l'empreinte ne l'est jamais.
 */
export const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
} as const;