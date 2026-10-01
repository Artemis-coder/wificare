/**
 * Distance et estimation d'arrivée (ETA).
 *
 * Le client attend une heure d'arrivée pendant que le technicien roule : c'est
 * le seul chiffre qui lui dise s'il a le temps de déjeuner avant l'intervention.
 * Il doit donc être honnête sur ce qu'il mesure — une distance, et une
 * estimation fondée sur une distance — et non une promesse.
 *
 * Tout est calculé à partir des coordonnées de `WifiZone`, relevées par le
 * client lui-même : sans elles, aucune ETA n'est affichable, et mieux vaut
 * n'afficher aucun chiffre qu'un chiffre faux. D'où les `null` plutôt que des
 * valeurs de repli.
 */

/** Point géographique, en degrés décimaux (WGS84). */
export type GeoPoint = {
  latitude: number;
  longitude: number;
};

/**
 * Destination telle que stockée sur une zone : les deux coordonnées sont
 * facultatives, puisqu'elles ne sont renseignées qu'une fois la position du
 * client partagée.
 */
export type ZoneCoordinates = {
  latitude: number | null;
  longitude: number | null;
};

/** Résultat d'un calcul d'ETA, quand la destination est inconnue. */
export type UnknownArrival = {
  distanceMeters: null;
  etaMinutes: null;
};

/** Résultat d'un calcul d'ETA, quand la destination est connue. */
export type KnownArrival = {
  distanceMeters: number;
  etaMinutes: number;
};

/**
 * Rayon moyen de la Terre.
 *
 * Une sphère de 6 371 km suffit ici : l'ETA est de toute façon bien plus
 * imprécise que l'écart entre les différents rayons usuels de la Terre.
 */
const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Facteur de détour par rapport à la ligne droite.
 *
 * Personne ne roule en ligne droite : le trajet réel est plus long que la
 * distance à vol d'oiseau, typiquement d'un tiers en agglomération. Sans cette
 * majoration, le client verrait arriver un technicien annoncé à l'heure et
 * toujours en retard, et finirait par douter de l'heure affichée.
 */
const ROAD_DETOUR_FACTOR = 1.3;

/**
 * Vitesse moyenne en agglomération, 25 km/h.
 *
 * Ordre de grandeur retenu pour un environnement urbain dense, où la circulation
 * impose l'essentiel du temps de parcours. Ce n'est pas une vitesse individuelle
 * mais une moyenne de terrain, ce qui est le seul chiffre honnête à connaître
 * sans historique de trajets.
 */
const URBAN_SPEED_METERS_PER_SECOND = 25_000 / 3_600;

/**
 * Plancher de l'ETA : 3 minutes.
 *
 * Le technicien est parfois déjà devant la porte. Afficher « 0 min » est faux
 * et défie le bon sens ; « moins de 3 minutes » reste vrai.
 */
const MIN_ETA_MINUTES = 3;

/**
 * Plafond de l'ETA : 240 minutes, soit 4 heures.
 *
 * Au-delà, la distance à vol d'oiseau cesse d'être une prédiction : la
 * circulation, les détours et la configuration du jour s'en écartent trop
 * pour qu'un chiffre précis soit honnête. Le plafond sert de garde-fou, il
 * indique « loin » sans promettre l'heure juste.
 */
const MAX_ETA_MINUTES = 240;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Vrai si un point est exploitable comme position.
 *
 * Un relevé GPS erroné peut produire une latitude hors bornes ; la distance
 * obtenue serait alors fausse mais plausible, ce qui est le pire cas pour une
 * ETA affichée au client. On préfère ne rien calculer.
 */
function isUsablePoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

/**
 * Distance à vol d'oiseau entre deux points, en mètres.
 *
 * Formule de haversine plutôt que la loi des cosinus : elle est numériquement
 * stable sur les très courtes distances, ce qui est précisément le cas ici, où
 * deux points peuvent être séparés de quelques mètres en fin d'intervention.
 *
 * Renvoie `null` si l'une des positions n'est pas exploitable.
 */
export function haversineMeters(
  a: GeoPoint,
  b: GeoPoint
): number | null {
  if (!isUsablePoint(a) || !isUsablePoint(b)) {
    return null;
  }

  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;

  return (
    2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)))
  );
}

/**
 * Traduit une distance en minutes d'arrivée.
 *
 * La durée n'est pas la distance divisée par la vitesse : elle est majorée du
 * détour routier puis bornée. Le résultat est arrondi à la minute — l'ETA est
 * une promesse de ordre de grandeur, une seconde de précision n'aurait aucun
 * sens et changerait l'affichage à chaque point GPS.
 *
 * Renvoie `null` si l'entrée n'est pas une distance exploitable : nulle,
 * négative, ou non finie. Zéro signifie que le technicien est déjà sur la
 * destination ; il n'y a plus de trajet à prédire, seulement une porte à
 * ouvrir, et un chiffre d'ETA n'y aurait aucun sens.
 */
export function etaMinutesFrom(distanceMeters: number): number | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return null;
  }

  const roadMeters = distanceMeters * ROAD_DETOUR_FACTOR;
  const minutes = roadMeters / URBAN_SPEED_METERS_PER_SECOND / 60;

  return Math.min(MAX_ETA_MINUTES, Math.max(MIN_ETA_MINUTES, Math.round(minutes)));
}

/**
 * Destination d'une zone, si elle est connue.
 *
 * Les deux coordonnées doivent être présentes et finies : une seule des deux ne
 * désigne aucun point sur la carte. Une zone sans position n'est pas une zone
 * sans coordonnées : c'est une destination inconnue.
 */
export function destinationOf(zone: ZoneCoordinates | null): GeoPoint | null {
  if (!zone) {
    return null;
  }

  const { latitude, longitude } = zone;

  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return { latitude, longitude };
}

/**
 * Distance et ETA entre la position d'un technicien et sa destination.
 *
 * La distance est arrondie au mètre : c'est l'unité dans laquelle le suivi est
 * affiché, et une distance au mètre près est déjà bien plus précise que la
 * position sous-jacente.
 *
 * Sans destination, rien n'est calculé et l'appelant reçoit des `null` : la
 * position du technicien reste consultable, mais aucun chiffre d'arrivée ne
 * doit être fabriqué, car le client verrait une ETA qui ne correspond à aucun
 * trajet.
 */
export function arrivalEstimateFrom(input: {
  technician: GeoPoint;
  destination: GeoPoint | null;
}): KnownArrival | UnknownArrival {
  const { technician, destination } = input;

  if (!destination) {
    return { distanceMeters: null, etaMinutes: null };
  }

  const distanceMeters = haversineMeters(technician, destination);

  if (distanceMeters === null) {
    return { distanceMeters: null, etaMinutes: null };
  }

  const roundedDistance = Math.round(distanceMeters);
  const etaMinutes = etaMinutesFrom(roundedDistance);

  if (etaMinutes === null) {
    return { distanceMeters: null, etaMinutes: null };
  }

  return { distanceMeters: roundedDistance, etaMinutes };
}
