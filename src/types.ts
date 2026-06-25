export type StopType =
  | "lodging"
  | "transport"
  | "attraction"
  | "food"
  | "activity"
  | "backup"
  | "note";

export type PlanChoice = "must" | "optional" | "dropped";
export type StopStatus = PlanChoice;
export type VisitStatus = "pending" | "done" | "skipped";

export interface TripMeta {
  id: string;
  slug: string;
  title: string;
  destination: string;
  dateRange: string;
  summary: string;
  coverTone?: "forest" | "coast" | "city";
  coverImage?: string;
  notes?: string;
}

export interface TripDay {
  id: string;
  label: string;
  date: string;
  city: string;
  summary: string;
}

export interface TripStop {
  id: string;
  dayId: string;
  sequence: number;
  type: StopType;
  name: string;
  time?: string;
  duration?: string;
  address?: string;
  coordinates?: [number, number];
  cost?: string;
  reservation?: string;
  tips?: string;
  notes?: string;
  source?: string;
  status?: StopStatus;
}

export interface TripLeg {
  id: string;
  dayId: string;
  fromStopId?: string;
  toStopId?: string;
  mode: string;
  duration?: string;
  cost?: string;
  notes?: string;
}

export interface TripOption {
  id: string;
  dayId?: string;
  type: StopType;
  name: string;
  coordinates?: [number, number];
  notes?: string;
  status?: StopStatus;
}

export interface TripPayload {
  trip: TripMeta;
  days: TripDay[];
  stops: TripStop[];
  legs: TripLeg[];
  options: TripOption[];
}
