"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

import "leaflet/dist/leaflet.css";

/**
 * Position du technicien et de sa destination, sur une carte.
 *
 * La régie supervise des interventions dispersées dans la ville : une distance
 * en mètres ne se situe pas. « À 1,2 km » ne dit pas si le technicien est resté
 * au dépôt ou s'est engagé dans le quartier de la panne — deux situations qui
 * appellent des décisions opposées.
 *
 * Les deux points sont dessinés ensemble, jamais un seul. Une carte ne montrant
 * qu'un marqueur dans le vide se lit comme un suivi cassé, et le technicien se
 * retrouve accusé d'un dysfonctionnement qu'il n'a pas.
 *
 * Les tuiles viennent d'OpenStreetMap : pas de clé API, pas de compte — comme
 * l'application mobile. L'attribution OSM doit rester affichée tant qu'on n'en
 * est pas autrement.
 */
type Position = { latitude: number; longitude: number };

type TechnicianMapProps = {
  technician: Position;
  destination?: Position | null;
  technicianName?: string | null;
};

export default function TechnicianMap({
  technician,
  destination,
  technicianName,
}: TechnicianMapProps) {
  const container = useRef<HTMLDivElement>(null);

  // La carte tient son propre cycle de vie, piloté depuis l'effet. Deux drapeaux
  // y sont nécessaires, et chacun règle un défaut observé :
  //
  // - `cancelled` ferme la porte à une création qui arriverait après le
  //   démontage. Leaflet est importé dynamiquement, donc la création est
  //   asynchrone : elle peut aboutir sur un nœud détaché, et laisser une carte
  //   orpheline en mémoire, invisible mais toujours active.
  //
  // - `created` empêche une seconde création sur le même conteneur. React rejoue
  //   les effets en mode développement, et Leaflet refuse alors d'initialiser
  //   deux fois le même nœud : il lève « Map container is already initialized ».
  //   Le symétriquement est incomplet — le premier effet a été nettoyé avant
  //   d'avoir construit quoi que ce soit —, et c'est ce trou qui laissait la
  //   page sans carte.
  const state = useRef<{
    cancelled: boolean;
    created: boolean;
    map: Leaflet.Map | null;
  }>({ cancelled: false, created: false, map: null });

  useEffect(() => {
    state.current = { cancelled: false, created: false, map: null };

    (async () => {
      const leaflet = (await import("leaflet")).default;

      // Leaflet manipule `window` : il ne peut être chargé qu'ici, jamais au
      // moment du rendu serveur.
      const node = container.current;
      if (!node || state.current.cancelled || state.current.created) return;

      state.current.created = true;

      const hasDestination = Boolean(destination);

      // Sans destination, on cadre serré : la position seule n'a pas d'échelle
      // utile, et un zoom large ne montrerait qu'un décor sans repère.
      const map = leaflet.map(node, {
        zoomControl: true,
        attributionControl: true,
      }).setView(
        [technician.latitude, technician.longitude],
        hasDestination ? 13 : 15,
      );

      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map);

      leaflet
        .marker([technician.latitude, technician.longitude], {
          title: technicianName ?? "Technicien",
          icon: pin(leaflet, "#5EEAD4"),
        })
        .addTo(map)
        .bindPopup(technicianName ? `<strong>${technicianName}</strong>` : "Technicien");

      if (hasDestination) {
        const points: [number, number][] = [
          [technician.latitude, technician.longitude],
          [destination!.latitude, destination!.longitude],
        ];

        leaflet
          .polyline(points, { color: "#5EEAD4", weight: 3, dashArray: "6 8" })
          .addTo(map);

        leaflet
          .marker(points[1], { icon: pin(leaflet, "#f59e0b") })
          .addTo(map)
          .bindPopup("<strong>Zone du client</strong>");

        // `fitBounds` cadre les deux points : centrer sur le technicien seul
        // laisserait la destination hors de l'écran, et la régie verrait un
        // trajet dont elle ignore la destination.
        map.fitBounds(leaflet.latLngBounds(points).pad(0.25));
      }

      // La carte est conservée : le nettoyage de l'effet doit pouvoir la
      // détruire même si elle a été créée après le démontage.
      state.current.map = map;

      // Leaflet ne connaît pas la taille d'un conteneur né dans un affichage
      // conditionnel : sans cet appel, la carte garde une taille vide et les
      // tuiles ne se centrent pas.
      setTimeout(() => {
        if (!state.current.cancelled) map.invalidateSize();
      }, 0);

    })();

    return () => {
      state.current.cancelled = true;
      // `remove()` est sans danger sur une carte absente : le nettoyage peut
      // précéder la création, l'import de Leaflet n'étant pas encore revenu.
      state.current.map?.remove();
      state.current.map = null;
    };
    // La carte est construite une fois : la position est un instantané figé à
    // l'ouverture de la page, pas un flux. Un rafraîchissement automatique
    // ferait sauter la carte sous le curseur de la régie en pleine lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={container}
      style={{
        width: "100%",
        height: "260px",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid var(--border-default)",
        background: "var(--bg-secondary)",
      }}
      role="img"
      aria-label="Position du technicien sur la carte"
    />
  );
}

/**
 * Marqueur dessiné en HTML plutôt que l'image par défaut de Leaflet.
 *
 * Leaflet charge `marker-icon.png` et `marker-shadow.png` depuis une URL calculée
 * à partir de sa feuille de style. Sous un empaqueteur, cette URL pointe vers
 * l'URL de la page — on obtenait des 404 sur `/tickets/marker-icon.png` — et le
 * marqueur se réduisait à une icône cassée. Un `divIcon` n'a aucun fichier à
 * charger : la pastille est du CSS, et elle suit le thème sans image.
 */
function pin(leaflet: typeof Leaflet, color: string) {
  return leaflet.divIcon({
    className: "",
    html: `<span style="
      display:block;width:16px;height:16px;border-radius:50%;
      background:${color};border:2px solid #0b1220;
      box-shadow:0 1px 4px rgba(0,0,0,.5);
    "></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}