"use client";

import { useEffect, useRef } from "react";
import type * as L from "leaflet";

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
 * retrouve-accusé d'un dysfonctionnement qu'il n'a pas.
 *
 * Les tuiles viennent d'OpenStreetMap : pas de clé API, pas de compte — comme
 * l'application mobile. L'attribution OSM doit rester affichée tant qu'on n'en
 * est pas autrement.
 */
type Position = {
  latitude: number;
  longitude: number;
};

type TechnicianMapProps = {
  /** Position du technicien, celle qu'il partage en ce moment. */
  technician: Position;
  /** Zone du client, destination de l'intervention. */
  destination?: Position | null;
  /** N'affiche que le technicien : la destination n'est pas connue. */
  technicianName?: string | null;
};

export default function TechnicianMap({
  technician,
  destination,
  technicianName,
}: TechnicianMapProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Leaflet ne se charge qu'ici : il manipule `window` à l'import, ce qui
    // échoue pendant le rendu serveur d'un composant client.
    let map: L.Map | undefined;

    (async () => {
      const leaflet = (await import("leaflet")).default;
      const node = container.current;

      if (!node || map) return;

      const hasDestination = Boolean(destination);

      // Sans destination, on cadre serré : la position seule n'a pas d'échelle
      // utile, et un zoom large ne montrerait qu'un décor sans repère.
      map = leaflet.map(node, {
        zoomControl: true,
        attributionControl: true,
      }).setView(
        [technician.latitude, technician.longitude],
        hasDestination ? 13 : 15,
      );

      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map);

      leaflet
        .marker([technician.latitude, technician.longitude], {
          title: technicianName ?? 'Technicien',
        })
        .addTo(map)
        .bindPopup(
          technicianName ? `<strong>${technicianName}</strong>` : 'Technicien',
        );

      if (hasDestination) {
        const points: [number, number][] = [
          [technician.latitude, technician.longitude],
          [destination!.latitude, destination!.longitude],
        ];

        leaflet
          .polyline(points, { color: '#5EEAD4', weight: 3, dashArray: '6 8' })
          .addTo(map);

        leaflet
          .marker(points[1])
          .addTo(map)
          .bindPopup('<strong>Zone du client</strong>');

        // `fitBounds` cadre les deux points : centrer sur le technicien seul
        // laisserait la destination hors de l'écran, et la régine verrait un
        // trajet dont elle ignore la destination.
        map.fitBounds(leaflet.latLngBounds(points).pad(0.25));
      }

      // Leaflet ne connaît pas la taille d'un conteneur né dans un affichage
      // conditionnel : sans cet appel, la carte garde une taille vide.
      setTimeout(() => map?.invalidateSize(), 0);
    })();

    return () => {
      map?.remove();
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
        border: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
      }}
      role="img"
      aria-label="Position du technicien sur la carte"
    />
  );
}