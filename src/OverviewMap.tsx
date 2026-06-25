import maplibregl, { Map, Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import type { TripPayload } from "./types";

const overviewStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function OverviewMap({ payload }: { payload: TripPayload }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker[]>([]);

  const dayPoints = useMemo(() => {
    return payload.days
      .map((day) => {
        const stops = payload.stops
          .filter((stop) => stop.dayId === day.id && stop.coordinates)
          .sort((a, b) => a.sequence - b.sequence);
        const primary = stops.find((stop) => stop.type !== "transport") ?? stops[0];
        return primary?.coordinates
          ? {
              day,
              coordinate: primary.coordinates,
              name: primary.name,
            }
          : null;
      })
      .filter((point): point is NonNullable<typeof point> => Boolean(point));
  }, [payload.days, payload.stops]);

  const routeCoordinates = useMemo(() => {
    const legCoordinates = payload.legs.flatMap((leg) => leg.coordinates ?? []);
    if (legCoordinates.length) return legCoordinates;
    return payload.stops
      .map((stop) => stop.coordinates)
      .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));
  }, [payload.legs, payload.stops]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: overviewStyle,
      center: routeCoordinates[0] ?? [135.6, 33.9],
      zoom: 7.5,
      interactive: true,
    });
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    return () => {
      markerRef.current.forEach((marker) => marker.remove());
      markerRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [routeCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRef.current.forEach((marker) => marker.remove());
    markerRef.current = [];

    const renderRoute = () => {
      if (!map.isStyleLoaded()) return;
      if (map.getLayer("overview-route")) map.removeLayer("overview-route");
      if (map.getSource("overview-route")) map.removeSource("overview-route");

      if (routeCoordinates.length > 1) {
        map.addSource("overview-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: routeCoordinates },
          },
        });
        map.addLayer({
          id: "overview-route",
          type: "line",
          source: "overview-route",
          paint: {
            "line-color": "#78b82a",
            "line-width": 5,
            "line-opacity": 0.72,
          },
        });
      }
    };

    dayPoints.forEach((point) => {
      const element = document.createElement("div");
      element.className = "overview-day-marker";
      element.innerHTML = `<strong>${point.day.label}</strong><span>${point.day.city}</span>`;
      element.title = `${point.day.label} ${point.name}`;
      const marker = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat(point.coordinate)
        .addTo(map);
      markerRef.current.push(marker);
    });

    payload.stays
      ?.filter((stay) => stay.coordinates)
      .forEach((stay) => {
        const element = document.createElement("div");
        element.className = "overview-stay-marker";
        element.title = stay.name;
        element.textContent = "宿";
        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat(stay.coordinates!)
          .addTo(map);
        markerRef.current.push(marker);
      });

    if (routeCoordinates.length) {
      const bounds = routeCoordinates.reduce(
        (current, coordinate) => current.extend(coordinate),
        new maplibregl.LngLatBounds(routeCoordinates[0], routeCoordinates[0]),
      );
      map.fitBounds(bounds, { padding: 46, maxZoom: 9.5, duration: 600 });
    }

    renderRoute();
    map.once("load", renderRoute);
  }, [dayPoints, payload.stays, routeCoordinates]);

  return (
    <section className="overview-card" aria-label="全程位置总览">
      <div className="overview-heading">
        <div>
          <p className="eyebrow">Route Overview</p>
          <h2>全程位置总览</h2>
        </div>
        <span>{payload.days.length} 天路线</span>
      </div>
      <div className="overview-map">
        <div className="overview-map-container" ref={containerRef} />
      </div>
    </section>
  );
}
