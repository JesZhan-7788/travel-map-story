import maplibregl, { Map, Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import type { TripOption, TripStop } from "./types";

const osmStyle: maplibregl.StyleSpecification = {
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

export function MapView({
  stops,
  options,
  selectedStopId,
  onSelectStop,
}: {
  stops: TripStop[];
  options: TripOption[];
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker[]>([]);

  const mappedStops = useMemo(() => stops.filter((stop) => stop.coordinates), [stops]);
  const dayOptions = useMemo(
    () =>
      options.filter(
        (option) => !option.dayId || stops.some((stop) => stop.dayId === option.dayId),
      ),
    [options, stops],
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: osmStyle,
      center: mappedStops[0]?.coordinates ?? [135.17, 34.23],
      zoom: 8.5,
    });
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    return () => {
      markerRef.current.forEach((marker) => marker.remove());
      markerRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mappedStops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRef.current.forEach((marker) => marker.remove());
    markerRef.current = [];

    const render = () => {
      const coordinates = mappedStops
        .map((stop) => stop.coordinates)
        .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));

      if (map.getLayer("active-route")) map.removeLayer("active-route");
      if (map.getSource("active-route")) map.removeSource("active-route");

      if (coordinates.length > 1) {
        map.addSource("active-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates },
          },
        });
        map.addLayer({
          id: "active-route",
          type: "line",
          source: "active-route",
          paint: {
            "line-color": "#ef6c45",
            "line-width": 4,
            "line-opacity": 0.82,
          },
        });
      }

      mappedStops.forEach((stop, index) => {
        const element = document.createElement("button");
        element.className = `map-marker ${stop.type} ${stop.id === selectedStopId ? "active" : ""}`;
        element.type = "button";
        element.textContent = String(index + 1);
        element.title = stop.name;
        element.addEventListener("click", () => onSelectStop(stop.id));

        const marker = new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat(stop.coordinates!)
          .addTo(map);
        markerRef.current.push(marker);
      });

      dayOptions
        .filter((option) => option.coordinates)
        .forEach((option) => {
          const element = document.createElement("span");
          element.className = "map-option";
          element.title = option.name;
          const marker = new maplibregl.Marker({ element, anchor: "center" })
            .setLngLat(option.coordinates!)
            .addTo(map);
          markerRef.current.push(marker);
        });

      if (coordinates.length) {
        const bounds = coordinates.reduce(
          (current, coordinate) => current.extend(coordinate),
          new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
        );
        map.fitBounds(bounds, { padding: 76, maxZoom: 11.5, duration: 700 });
      }
    };

    if (map.loaded()) render();
    else map.once("load", render);
  }, [dayOptions, mappedStops, onSelectStop, selectedStopId]);

  useEffect(() => {
    const selected = mappedStops.find((stop) => stop.id === selectedStopId);
    if (selected?.coordinates) {
      mapRef.current?.flyTo({ center: selected.coordinates, zoom: 11, duration: 650 });
    }
  }, [mappedStops, selectedStopId]);

  return (
    <div className="map-wrap">
      <div className="map-container" ref={containerRef} />
      <div className="map-caption">路线为点位直连；具体交通以地点卡备注为准。</div>
    </div>
  );
}
