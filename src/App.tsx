import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Footprints,
  Hotel,
  MapPin,
  Navigation,
  Route,
  ShieldCheck,
  TrainFront,
  Utensils,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trips, getTripBySlug } from "./data/trips";
import { MapView } from "./MapView";
import type { StopStatus, StopType, TripPayload, TripStop } from "./types";

const statusLabels: Record<StopStatus, string> = {
  must: "必去",
  optional: "可选",
  dropped: "放弃",
};

const typeLabels: Record<StopType, string> = {
  lodging: "住宿",
  transport: "交通",
  attraction: "景点",
  food: "美食",
  activity: "活动",
  backup: "备选",
  note: "备注",
};

const typeIcons: Record<StopType, JSX.Element> = {
  lodging: <Hotel size={16} />,
  transport: <TrainFront size={16} />,
  attraction: <MapPin size={16} />,
  food: <Utensils size={16} />,
  activity: <Footprints size={16} />,
  backup: <Route size={16} />,
  note: <ShieldCheck size={16} />,
};

const readRoute = () => {
  const match = window.location.pathname.match(/^\/trips\/([^/]+)\/?$/);
  return match?.[1] ?? null;
};

const navigateTo = (path: string) => {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const loadStatuses = (tripId: string) => {
  try {
    return JSON.parse(localStorage.getItem(`trip-status:${tripId}`) ?? "{}") as Record<
      string,
      StopStatus
    >;
  } catch {
    return {};
  }
};

export function App() {
  const [activeSlug, setActiveSlug] = useState<string | null>(() => readRoute());

  useEffect(() => {
    const syncRoute = () => setActiveSlug(readRoute());
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  const trip = activeSlug ? getTripBySlug(activeSlug) : null;

  if (!activeSlug) {
    return <TripIndex onOpen={(slug) => navigateTo(`/trips/${slug}`)} />;
  }

  if (!trip) {
    return (
      <main className="state-screen">
        <div>
          <h1>没有找到这趟旅行</h1>
          <button className="text-button" onClick={() => navigateTo("/")} type="button">
            <ArrowLeft size={16} />
            回到首页
          </button>
        </div>
      </main>
    );
  }

  return <TripDetail payload={trip} onBack={() => navigateTo("/")} />;
}

function TripIndex({ onOpen }: { onOpen: (slug: string) => void }) {
  return (
    <main className="home-shell">
      <header className="home-header">
        <p className="eyebrow">Travel Map Stories</p>
        <h1>旅行地图故事线</h1>
        <p>
          把攻略从表格整理成可分享的地图时间线。当前是只读脱敏版，适合先在手机和同行人那里验证真实使用感。
        </p>
      </header>

      <section className="trip-grid" aria-label="旅行列表">
        {trips.map((item) => (
          <article className={`trip-card ${item.trip.coverTone ?? "forest"}`} key={item.trip.id}>
            <div>
              <p>{item.trip.destination}</p>
              <h2>{item.trip.title}</h2>
              <span>
                <CalendarDays size={15} />
                {item.trip.dateRange}
              </span>
            </div>
            <p>{item.trip.summary}</p>
            <button onClick={() => onOpen(item.trip.slug)} type="button">
              打开地图
              <Navigation size={16} />
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

function TripDetail({ payload, onBack }: { payload: TripPayload; onBack: () => void }) {
  const [activeDayId, setActiveDayId] = useState<string>(payload.days[0]?.id ?? "");
  const [selectedStopId, setSelectedStopId] = useState<string | null>(payload.stops[0]?.id ?? null);
  const [mode, setMode] = useState<"planning" | "travel">("planning");
  const [statuses, setStatuses] = useState<Record<string, StopStatus>>({});

  useEffect(() => {
    setActiveDayId(payload.days[0]?.id ?? "");
    setSelectedStopId(payload.stops[0]?.id ?? null);
    setStatuses(loadStatuses(payload.trip.id));
  }, [payload]);

  useEffect(() => {
    localStorage.setItem(`trip-status:${payload.trip.id}`, JSON.stringify(statuses));
  }, [payload.trip.id, statuses]);

  const activeStops = useMemo(() => {
    return payload.stops
      .filter((stop) => stop.dayId === activeDayId)
      .map((stop) => ({ ...stop, status: statuses[stop.id] ?? stop.status ?? "must" }))
      .sort((a, b) => a.sequence - b.sequence);
  }, [activeDayId, payload.stops, statuses]);

  const activeDay = payload.days.find((day) => day.id === activeDayId);
  const selectedStop = activeStops.find((stop) => stop.id === selectedStopId) ?? activeStops[0];
  const nextStop = activeStops.find((stop) => stop.status !== "dropped");

  const setStopStatus = (stopId: string, status: StopStatus) => {
    setStatuses((current) => ({ ...current, [stopId]: status }));
  };

  return (
    <main className="app-shell">
      <section className="planner-panel" aria-label="行程时间线">
        <button className="back-button" onClick={onBack} type="button">
          <ArrowLeft size={16} />
          全部旅行
        </button>

        <header className="trip-header">
          <div>
            <p className="eyebrow">{payload.trip.destination}</p>
            <h1>{payload.trip.title}</h1>
            <p className="trip-meta">
              <CalendarDays size={16} /> {payload.trip.dateRange}
            </p>
          </div>
          <div className="mode-switch" aria-label="切换使用模式">
            <button
              className={mode === "planning" ? "active" : ""}
              onClick={() => setMode("planning")}
              type="button"
            >
              <Route size={16} />
              规划
            </button>
            <button
              className={mode === "travel" ? "active" : ""}
              onClick={() => setMode("travel")}
              type="button"
            >
              <Navigation size={16} />
              旅途中
            </button>
          </div>
        </header>

        <div className="day-tabs" role="tablist" aria-label="选择日期">
          {payload.days.map((day) => (
            <button
              className={day.id === activeDayId ? "active" : ""}
              key={day.id}
              onClick={() => {
                setActiveDayId(day.id);
                setSelectedStopId(payload.stops.find((stop) => stop.dayId === day.id)?.id ?? null);
              }}
              role="tab"
              type="button"
            >
              <span>{day.label}</span>
              <strong>{day.city}</strong>
            </button>
          ))}
        </div>

        {mode === "travel" && nextStop ? (
          <aside className="next-card">
            <p>下一站</p>
            <h2>{nextStop.name}</h2>
            <span>{nextStop.time || activeDay?.summary}</span>
          </aside>
        ) : null}

        <section className="day-summary">
          <p>{activeDay?.date}</p>
          <h2>{activeDay?.summary}</h2>
        </section>

        <div className="timeline">
          {activeStops.map((stop) => (
            <button
              className={`stop-row ${stop.id === selectedStop?.id ? "active" : ""} ${
                stop.status === "dropped" ? "dropped" : ""
              }`}
              key={stop.id}
              onClick={() => setSelectedStopId(stop.id)}
              type="button"
            >
              <span className={`type-dot ${stop.type}`}>{typeIcons[stop.type]}</span>
              <span className="stop-copy">
                <strong>{stop.name}</strong>
                <small>
                  {stop.time || typeLabels[stop.type]} · {statusLabels[stop.status ?? "must"]}
                </small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="map-stage" aria-label="地图">
        <MapView
          options={payload.options}
          selectedStopId={selectedStop?.id ?? null}
          stops={activeStops}
          onSelectStop={setSelectedStopId}
        />
      </section>

      {selectedStop ? (
        <StopDetail
          mode={mode}
          stop={selectedStop}
          onSetStatus={(status) => setStopStatus(selectedStop.id, status)}
        />
      ) : null}
    </main>
  );
}

function StopDetail({
  mode,
  stop,
  onSetStatus,
}: {
  mode: "planning" | "travel";
  stop: TripStop;
  onSetStatus: (status: StopStatus) => void;
}) {
  return (
    <aside className="detail-panel" aria-label="地点详情">
      <div className="detail-heading">
        <span className={`type-pill ${stop.type}`}>{typeLabels[stop.type]}</span>
        <h2>{stop.name}</h2>
        {stop.address ? <p>{stop.address}</p> : null}
      </div>

      <div className="detail-grid">
        {stop.time ? (
          <InfoItem icon={<Clock3 size={16} />} label="时间" value={stop.time} />
        ) : null}
        <InfoItem icon={typeIcons[stop.type]} label="类型" value={typeLabels[stop.type]} />
      </div>

      {stop.notes ? <p className="notes">{stop.notes}</p> : null}

      {mode === "planning" ? (
        <div className="status-actions" aria-label="规划状态">
          <button onClick={() => onSetStatus("must")} type="button">
            <CheckCircle2 size={16} /> 必去
          </button>
          <button onClick={() => onSetStatus("optional")} type="button">
            <Route size={16} /> 可选
          </button>
          <button onClick={() => onSetStatus("dropped")} type="button">
            <XCircle size={16} /> 放弃
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function InfoItem({ icon, label, value }: { icon: JSX.Element; label: string; value: string }) {
  return (
    <div className="info-item">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
