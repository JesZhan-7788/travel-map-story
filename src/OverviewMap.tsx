import maplibregl, { Map, Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TripPayload } from "./types";

const overviewStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function isCompactScreen() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

export function OverviewMap({ payload }: { payload: TripPayload }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const routeSvgRef = useRef<SVGSVGElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker[]>([]);
  const [isCompact, setIsCompact] = useState(isCompactScreen);
  const [shouldShowMap, setShouldShowMap] = useState(() => !isCompactScreen());

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
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 760px)");
    const syncScreen = () => {
      setIsCompact(query.matches);
      if (!query.matches) setShouldShowMap(true);
    };

    syncScreen();
    query.addEventListener("change", syncScreen);
    return () => query.removeEventListener("change", syncScreen);
  }, []);

  useEffect(() => {
    if (!shouldShowMap || !containerRef.current || mapRef.current) return;

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
  }, [routeCoordinates, shouldShowMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRef.current.forEach((marker) => marker.remove());
    markerRef.current = [];

    const updateRouteOverlay = () => {
      const svg = routeSvgRef.current;
      const container = containerRef.current;
      if (!svg || !container || routeCoordinates.length < 2) return;

      const rect = container.getBoundingClientRect();
      const points = routeCoordinates
        .map((coordinate) => {
          const point = map.project(coordinate);
          return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
        })
        .join(" ");

      svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
      svg.querySelectorAll("polyline").forEach((line) => line.setAttribute("points", points));
      container.setAttribute("data-route-rendered", "true");
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

    updateRouteOverlay();
    const routeTimers = [
      window.setTimeout(updateRouteOverlay, 80),
      window.setTimeout(updateRouteOverlay, 700),
    ];
    map.on("load", updateRouteOverlay);
    map.on("idle", updateRouteOverlay);
    map.on("move", updateRouteOverlay);
    map.on("zoom", updateRouteOverlay);
    map.on("resize", updateRouteOverlay);
    return () => {
      routeTimers.forEach((timer) => window.clearTimeout(timer));
      map.off("load", updateRouteOverlay);
      map.off("idle", updateRouteOverlay);
      map.off("move", updateRouteOverlay);
      map.off("zoom", updateRouteOverlay);
      map.off("resize", updateRouteOverlay);
    };
  }, [dayPoints, payload.stays, routeCoordinates, shouldShowMap]);

  return (
    <section className="overview-card" aria-label="全程位置总览">
      <div className="overview-heading">
        <div>
          <p className="eyebrow">Route Overview</p>
          <h2>全程位置总览</h2>
        </div>
        <span>{payload.days.length} 天路线</span>
      </div>
      {shouldShowMap ? (
        <div className="overview-map">
          <div className="overview-map-container" ref={containerRef} />
          <svg className="overview-route-overlay" ref={routeSvgRef} aria-hidden="true">
            <polyline className="overview-route-casing" fill="none" />
            <polyline className="overview-route-line" fill="none" />
          </svg>
        </div>
      ) : (
        <div className="overview-placeholder">
          <div className="overview-preview-days" aria-label="路线摘要">
            {dayPoints.slice(0, 4).map((point) => (
              <span key={point.day.id}>
                {point.day.label} · {point.day.city}
              </span>
            ))}
          </div>
          <button type="button" onClick={() => setShouldShowMap(true)}>
            {isCompact ? "打开总览地图" : "显示总览地图"}
          </button>
        </div>
      )}
    </section>
  );
}
