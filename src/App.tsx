import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Footprints,
  Hotel,
  ListChecks,
  Map,
  MapPin,
  Navigation,
  Route,
  ShieldCheck,
  TrainFront,
  Utensils,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { trips, getTripBySlug } from "./data/trips";
import { MapView } from "./MapView";
import { OverviewMap } from "./OverviewMap";
import type { PlanChoice, StopType, TripLeg, TripPayload, TripStay, TripStop, VisitStatus } from "./types";

type StopWithState = TripStop & {
  planChoice: PlanChoice;
  visitStatus: VisitStatus;
};

const swipeThreshold = 72;

const planLabels: Record<PlanChoice, string> = {
  must: "必去",
  optional: "可选",
  dropped: "放弃",
};

const visitLabels: Record<VisitStatus, string> = {
  pending: "未完成",
  done: "已完成",
  skipped: "已跳过",
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

const isMobileViewport = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;

const readStoredRecord = <T extends string>(key: string): Record<string, T> => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, T>;
  } catch {
    return {};
  }
};

const getNavigationUrl = (stop: TripStop) => {
  if (stop.coordinates) {
    const [lng, lat] = stop.coordinates;
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    stop.address || stop.name,
  )}`;
};

const getCoordinateNavigationUrl = (name: string, coordinates?: [number, number], address?: string) => {
  if (coordinates) {
    const [lng, lat] = coordinates;
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || name)}`;
};

const getDurationSuggestion = (stop: TripStop) => {
  if (stop.duration) return stop.duration;

  const suggestions: Record<StopType, string> = {
    lodging: "办理入住/休整",
    transport: "预留换乘缓冲",
    attraction: "约 1-2 小时",
    food: "约 45-90 分钟",
    activity: "约 1-2 小时",
    backup: "视时间决定",
    note: "出发前确认",
  };

  return suggestions[stop.type];
};

const getAttentionText = (stop: TripStop) => {
  if (stop.tips) return stop.tips;
  if (stop.notes) return stop.notes;
  return "暂无特别注意事项，出发前按天气、交通和体力再确认一次。";
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
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [mode, setMode] = useState<"planning" | "travel">("travel");
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [isMobileScreen, setIsMobileScreen] = useState(isMobileViewport);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [planChoices, setPlanChoices] = useState<Record<string, PlanChoice>>({});
  const [visitStatuses, setVisitStatuses] = useState<Record<string, VisitStatus>>({});

  useEffect(() => {
    setActiveDayId(payload.days[0]?.id ?? "");
    setSelectedStopId(null);
    setMode("travel");
    setMobileView("list");
    setDetailExpanded(false);
    setPlanChoices({
      ...readStoredRecord<PlanChoice>(`trip-status:${payload.trip.id}`),
      ...readStoredRecord<PlanChoice>(`trip-plan-choice:${payload.trip.id}`),
    });
    setVisitStatuses(readStoredRecord<VisitStatus>(`trip-visit-status:${payload.trip.id}`));
  }, [payload]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 760px)");
    const syncViewport = () => setIsMobileScreen(query.matches);

    syncViewport();
    query.addEventListener("change", syncViewport);
    return () => query.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    localStorage.setItem(`trip-plan-choice:${payload.trip.id}`, JSON.stringify(planChoices));
  }, [payload.trip.id, planChoices]);

  useEffect(() => {
    localStorage.setItem(`trip-visit-status:${payload.trip.id}`, JSON.stringify(visitStatuses));
  }, [payload.trip.id, visitStatuses]);

  const activeStops = useMemo<StopWithState[]>(() => {
    return payload.stops
      .filter((stop) => stop.dayId === activeDayId)
      .map((stop) => ({
        ...stop,
        planChoice: planChoices[stop.id] ?? stop.status ?? "must",
        visitStatus: visitStatuses[stop.id] ?? "pending",
      }))
      .sort((a, b) => a.sequence - b.sequence);
  }, [activeDayId, payload.stops, planChoices, visitStatuses]);

  const activeDay = payload.days.find((day) => day.id === activeDayId);
  const activeStay = payload.stays?.find((stay) => stay.dayId === activeDayId) ?? null;
  const activeLegs = payload.legs.filter((leg) => leg.dayId === activeDayId);
  const selectedStop = selectedStopId
    ? activeStops.find((stop) => stop.id === selectedStopId) ?? null
    : null;
  const actionableStops = activeStops.filter((stop) => stop.planChoice !== "dropped");
  const completedCount = actionableStops.filter((stop) => stop.visitStatus === "done").length;
  const skippedCount = actionableStops.filter((stop) => stop.visitStatus === "skipped").length;
  const remainingCount = actionableStops.length - completedCount - skippedCount;
  const progressTotal = actionableStops.length;
  const progressPercent = progressTotal ? Math.round(((completedCount + skippedCount) / progressTotal) * 100) : 0;
  const nextStop =
    activeStops.find(
      (stop) => stop.planChoice !== "dropped" && stop.visitStatus === "pending",
    ) ?? null;
  const shouldRenderMap = !isMobileScreen || mobileView === "map";

  const selectStop = (stopId: string, expand = false) => {
    setSelectedStopId(stopId);
    setDetailExpanded(expand);
  };

  const setPlanChoice = (stopId: string, planChoice: PlanChoice) => {
    setPlanChoices((current) => ({ ...current, [stopId]: planChoice }));
  };

  const setVisitStatus = (stopId: string, visitStatus: VisitStatus) => {
    setVisitStatuses((current) => ({ ...current, [stopId]: visitStatus }));
  };

  return (
    <main className={`app-shell mobile-${mobileView} ${selectedStop ? "has-detail" : "no-detail"}`}>
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
              className={mode === "travel" ? "active" : ""}
              onClick={() => setMode("travel")}
              type="button"
            >
              <Navigation size={16} />
              旅途中
            </button>
            <button
              className={mode === "planning" ? "active" : ""}
              onClick={() => setMode("planning")}
              type="button"
            >
              <Route size={16} />
              规划
            </button>
          </div>
        </header>

        <OverviewMap payload={payload} />

        <div className="day-tabs" role="tablist" aria-label="选择日期">
          {payload.days.map((day) => (
            <button
              className={day.id === activeDayId ? "active" : ""}
              key={day.id}
              onClick={() => {
                setActiveDayId(day.id);
                setSelectedStopId(null);
                setDetailExpanded(false);
              }}
              role="tab"
              type="button"
            >
              <span>{day.label}</span>
              <strong>{day.city}</strong>
            </button>
          ))}
        </div>

        <div className="mobile-view-switch" aria-label="手机视图切换">
          <button
            className={mobileView === "list" ? "active" : ""}
            onClick={() => setMobileView("list")}
            type="button"
          >
            <ListChecks size={16} />
            清单
          </button>
          <button
            className={mobileView === "map" ? "active" : ""}
            onClick={() => setMobileView("map")}
            type="button"
          >
            <Map size={16} />
            地图
          </button>
        </div>

        {mode === "travel" ? (
          <TravelProgress
            completedCount={completedCount}
            nextStop={nextStop}
            progressPercent={progressPercent}
            remainingCount={remainingCount}
            skippedCount={skippedCount}
            total={progressTotal}
            onSelectNext={() => {
              if (nextStop) selectStop(nextStop.id, true);
            }}
          />
        ) : null}

        <section className="day-summary">
          <p>{activeDay?.date}</p>
          <h2>{activeDay?.summary}</h2>
        </section>

        {activeStay ? <StayCard stay={activeStay} /> : null}

        <div className="timeline">
          {activeStops.map((stop) => {
            const followingLegs = activeLegs.filter((leg) => leg.fromStopId === stop.id);
            return (
              <div className="timeline-item" key={stop.id}>
                <StopRow
                  isActive={stop.id === selectedStop?.id}
                  mode={mode}
                  stop={stop}
                  onSelect={() => selectStop(stop.id, true)}
                  onSetVisitStatus={(visitStatus) => setVisitStatus(stop.id, visitStatus)}
                />
                {followingLegs.map((leg) => (
                  <TransportCard key={leg.id} leg={leg} />
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {shouldRenderMap ? (
        <section className="map-stage" aria-label="地图">
          <MapView
            key={mobileView}
            options={payload.options}
            selectedStopId={selectedStop?.id ?? null}
            stops={activeStops}
            onSelectStop={(stopId) => selectStop(stopId, true)}
          />
        </section>
      ) : null}

      {selectedStop ? (
        <StopDetail
          expanded={detailExpanded}
          mode={mode}
          stop={selectedStop}
          onClose={() => setSelectedStopId(null)}
          onSetExpanded={setDetailExpanded}
          onSetPlanChoice={(planChoice) => setPlanChoice(selectedStop.id, planChoice)}
          onSetVisitStatus={(visitStatus) => setVisitStatus(selectedStop.id, visitStatus)}
        />
      ) : null}
    </main>
  );
}

function StayCard({ stay }: { stay: TripStay }) {
  return (
    <aside className="stay-card" aria-label="今日住宿">
      <div className="stay-card-heading">
        <span>
          <Hotel size={17} />
        </span>
        <div>
          <p>今日住宿</p>
          <h3>{stay.name}</h3>
        </div>
      </div>
      <div className="stay-meta">
        {stay.nights ? <span>{stay.nights}</span> : null}
        {stay.checkIn ? <span>入住：{stay.checkIn}</span> : null}
        {stay.checkOut ? <span>退房：{stay.checkOut}</span> : null}
      </div>
      {stay.area || stay.address ? <p className="stay-area">{stay.address || stay.area}</p> : null}
      {stay.notes ? <p className="stay-notes">{stay.notes}</p> : null}
      <a
        className="stay-nav"
        href={getCoordinateNavigationUrl(stay.name, stay.coordinates, stay.address || stay.area)}
        rel="noreferrer"
        target="_blank"
      >
        <Navigation size={16} />
        导航到住宿
      </a>
    </aside>
  );
}

function TransportCard({ leg }: { leg: TripLeg }) {
  return (
    <aside className="transport-card" aria-label="交通建议">
      <div className="transport-title">
        <span>
          <TrainFront size={15} />
        </span>
        <div>
          <p>{leg.mode}</p>
          <h3>{leg.title || "交通建议"}</h3>
        </div>
      </div>
      {leg.route ? <p className="transport-route">{leg.route}</p> : null}
      <div className="transport-meta">
        {leg.duration ? <span>{leg.duration}</span> : null}
        {leg.tip ? <span>{leg.tip}</span> : null}
      </div>
      {leg.notes ? <p className="transport-notes">{leg.notes}</p> : null}
    </aside>
  );
}

function TravelProgress({
  completedCount,
  nextStop,
  progressPercent,
  remainingCount,
  skippedCount,
  total,
  onSelectNext,
}: {
  completedCount: number;
  nextStop: StopWithState | null;
  progressPercent: number;
  remainingCount: number;
  skippedCount: number;
  total: number;
  onSelectNext: () => void;
}) {
  return (
    <aside className="travel-progress" aria-label="今日进度">
      <div className="progress-topline">
        <div>
          <p>今日进度</p>
          <strong>
            {completedCount}/{total} 已完成
          </strong>
        </div>
        <span>{remainingCount} 个待走</span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${progressPercent}%` }} />
      </div>
      {nextStop ? (
        <button className="next-card" onClick={onSelectNext} type="button">
          <span>下一站</span>
          <strong>{nextStop.name}</strong>
          <small>{nextStop.time || typeLabels[nextStop.type]}</small>
        </button>
      ) : (
        <div className="next-card complete">
          <span>今天清单</span>
          <strong>已全部处理</strong>
          <small>{skippedCount ? `其中 ${skippedCount} 个已跳过` : "可以安心收尾了"}</small>
        </div>
      )}
    </aside>
  );
}

function StopRow({
  isActive,
  mode,
  stop,
  onSelect,
  onSetVisitStatus,
}: {
  isActive: boolean;
  mode: "planning" | "travel";
  stop: StopWithState;
  onSelect: () => void;
  onSetVisitStatus: (visitStatus: VisitStatus) => void;
}) {
  const [dragX, setDragX] = useState(0);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const dragXRef = useRef(0);
  const ignoreClickRef = useRef(false);
  const swiping = mode === "travel" && stop.planChoice !== "dropped";

  const beginSwipe = (event: PointerEvent<HTMLElement>) => {
    if (!swiping) return;
    startPoint.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSwipe = (event: PointerEvent<HTMLElement>) => {
    if (!startPoint.current || !swiping) return;
    const deltaX = event.clientX - startPoint.current.x;
    const deltaY = event.clientY - startPoint.current.y;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) return;
    const nextDragX = Math.max(-112, Math.min(112, deltaX));
    dragXRef.current = nextDragX;
    setDragX(nextDragX);
  };

  const endSwipe = (event: PointerEvent<HTMLElement>) => {
    if (!startPoint.current || !swiping) return;
    const finalX = dragXRef.current;
    startPoint.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragXRef.current = 0;
    setDragX(0);

    if (finalX <= -swipeThreshold) {
      onSetVisitStatus(stop.visitStatus === "done" ? "pending" : "done");
      ignoreClickRef.current = true;
    } else if (finalX >= swipeThreshold) {
      onSetVisitStatus(stop.visitStatus === "skipped" ? "pending" : "skipped");
      ignoreClickRef.current = true;
    }

    window.setTimeout(() => {
      ignoreClickRef.current = false;
    }, 200);
  };

  const stopStyle = {
    transform: `translateX(${dragX}px)`,
  };

  return (
    <article
      className={`stop-row ${isActive ? "active" : ""} ${
        stop.planChoice === "dropped" ? "dropped" : ""
      } ${stop.visitStatus} ${dragX < -16 ? "swiping-done" : ""} ${
        dragX > 16 ? "swiping-skip" : ""
      }`}
      onPointerCancel={endSwipe}
      onPointerDown={beginSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={endSwipe}
    >
      <div className="swipe-hint done-hint" aria-hidden="true">
        <CheckCircle2 size={16} />
        完成
      </div>
      <div className="swipe-hint skip-hint" aria-hidden="true">
        <XCircle size={16} />
        跳过
      </div>

      <button
        className="stop-main"
        onClick={() => {
          if (ignoreClickRef.current) return;
          if (Math.abs(dragX) < 8) onSelect();
        }}
        style={stopStyle}
        type="button"
      >
        <span className={`type-dot ${stop.type}`}>{typeIcons[stop.type]}</span>
        <span className="stop-copy">
          <strong>{stop.name}</strong>
          <small>
            {stop.time || typeLabels[stop.type]} · {planLabels[stop.planChoice]}
            {mode === "travel" ? ` · ${visitLabels[stop.visitStatus]}` : ""}
          </small>
        </span>
      </button>
    </article>
  );
}

function StopDetail({
  expanded,
  mode,
  stop,
  onClose,
  onSetExpanded,
  onSetPlanChoice,
  onSetVisitStatus,
}: {
  expanded: boolean;
  mode: "planning" | "travel";
  stop: StopWithState;
  onClose: () => void;
  onSetExpanded: (expanded: boolean) => void;
  onSetPlanChoice: (planChoice: PlanChoice) => void;
  onSetVisitStatus: (visitStatus: VisitStatus) => void;
}) {
  return (
    <aside className={`detail-panel ${expanded ? "expanded" : "collapsed"}`} aria-label="地点详情">
      <div className="detail-peek">
        <button className="peek-main" onClick={() => onSetExpanded(!expanded)} type="button">
          <span className={`type-dot ${stop.type}`}>{typeIcons[stop.type]}</span>
          <span>
            <small>{stop.time || typeLabels[stop.type]}</small>
            <strong>{stop.name}</strong>
          </span>
          <ChevronDown size={18} />
        </button>
        <a className="icon-action" href={getNavigationUrl(stop)} rel="noreferrer" target="_blank">
          <Navigation size={17} />
          导航
        </a>
        <button className="icon-action close" onClick={onClose} type="button" aria-label="关闭详情">
          <X size={18} />
        </button>
      </div>

      <div className="detail-body">
        <div className="detail-heading">
          <span className={`type-pill ${stop.type}`}>{typeLabels[stop.type]}</span>
          <h2>{stop.name}</h2>
          {stop.address ? <p>{stop.address}</p> : null}
        </div>

        <div className="detail-grid">
          {stop.time ? (
            <InfoItem icon={<Clock3 size={16} />} label="时间" value={stop.time} />
          ) : null}
          <InfoItem
            icon={<Clock3 size={16} />}
            label="建议"
            value={getDurationSuggestion(stop)}
          />
          <InfoItem icon={typeIcons[stop.type]} label="类型" value={typeLabels[stop.type]} />
          <InfoItem icon={<ShieldCheck size={16} />} label="状态" value={visitLabels[stop.visitStatus]} />
        </div>

        <section className="detail-section">
          <h3>注意事项</h3>
          <p className="notes">{getAttentionText(stop)}</p>
        </section>

        {mode === "travel" ? (
          <div className="status-actions travel-actions" aria-label="旅行进度">
            <button
              className={stop.visitStatus === "done" ? "active" : ""}
              onClick={() => onSetVisitStatus(stop.visitStatus === "done" ? "pending" : "done")}
              type="button"
            >
              <CheckCircle2 size={16} /> 完成
            </button>
            <button
              className={stop.visitStatus === "skipped" ? "active" : ""}
              onClick={() =>
                onSetVisitStatus(stop.visitStatus === "skipped" ? "pending" : "skipped")
              }
              type="button"
            >
              <XCircle size={16} /> 跳过
            </button>
            <a href={getNavigationUrl(stop)} rel="noreferrer" target="_blank">
              <Navigation size={16} /> 导航
            </a>
          </div>
        ) : (
          <div className="status-actions" aria-label="规划状态">
            <button
              className={stop.planChoice === "must" ? "active" : ""}
              onClick={() => onSetPlanChoice("must")}
              type="button"
            >
              <CheckCircle2 size={16} /> 必去
            </button>
            <button
              className={stop.planChoice === "optional" ? "active" : ""}
              onClick={() => onSetPlanChoice("optional")}
              type="button"
            >
              <Route size={16} /> 可选
            </button>
            <button
              className={stop.planChoice === "dropped" ? "active" : ""}
              onClick={() => onSetPlanChoice("dropped")}
              type="button"
            >
              <XCircle size={16} /> 放弃
            </button>
          </div>
        )}
      </div>
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
