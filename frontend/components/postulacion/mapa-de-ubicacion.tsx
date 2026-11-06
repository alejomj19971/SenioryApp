"use client";

import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordenada } from "@/lib/hooks/use-ubicacion";

// Medellín: el centro por defecto si el cuidador todavía no ha fijado nada (la zona más común hoy en el
// directorio). Es solo un punto de partida para mirar el mapa; nunca se guarda si no se toca el mapa.
const CENTRO_POR_DEFECTO: [number, number] = [6.244203, -75.581212];
const ZOOM_SIN_PIN = 12;
const ZOOM_CON_PIN = 15;

// Un pin propio en SVG (no los PNG por defecto de Leaflet, que necesitan empaquetar imágenes aparte). `currentColor`
// toma el color de `className` para que combine con la paleta de la app en claro y oscuro.
const iconoDelPin = L.divIcon({
  className: "text-primary",
  html: `<svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" stroke="white" stroke-width="1"><path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.72 11.34 7.06 11.64a1.4 1.4 0 0 0 1.88 0C13.28 21.34 20 15.25 20 10c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 32],
});

interface MapaDeUbicacionProps {
  pin: Coordenada | null;
  // Un punto al que centrar el mapa de golpe (al usar «mi ubicación actual»); el click y el arrastre ya centran
  // solos porque el pin queda donde la persona tocó.
  centrarEn: Coordenada | null;
  onCambiar: (pin: Coordenada) => void;
}

function Clics({ onCambiar }: { onCambiar: MapaDeUbicacionProps["onCambiar"] }) {
  useMapEvents({
    click(evento) {
      onCambiar({ latitud: evento.latlng.lat, longitud: evento.latlng.lng });
    },
  });
  return null;
}

function Recentrar({ centrarEn }: { centrarEn: Coordenada | null }) {
  const mapa = useMap();
  useEffect(() => {
    if (centrarEn !== null) mapa.setView([centrarEn.latitud, centrarEn.longitud], ZOOM_CON_PIN);
  }, [centrarEn, mapa]);
  return null;
}

export function MapaDeUbicacion({ pin, centrarEn, onCambiar }: MapaDeUbicacionProps) {
  const centro: [number, number] = pin !== null ? [pin.latitud, pin.longitud] : CENTRO_POR_DEFECTO;

  return (
    <MapContainer
      center={centro}
      zoom={pin !== null ? ZOOM_CON_PIN : ZOOM_SIN_PIN}
      scrollWheelZoom={false}
      className="h-72 w-full rounded-2xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Clics onCambiar={onCambiar} />
      <Recentrar centrarEn={centrarEn} />
      {pin !== null && (
        <Marker
          position={[pin.latitud, pin.longitud]}
          icon={iconoDelPin}
          draggable
          eventHandlers={{
            dragend: (evento) => {
              const posicion = evento.target.getLatLng();
              onCambiar({ latitud: posicion.lat, longitud: posicion.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}
