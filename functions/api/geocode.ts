type PagesFunctionContext = {
  request: Request;
};

type PagesFunction = (context: PagesFunctionContext) => Response | Promise<Response>;

type GeocodeResponse = {
  ok: boolean;
  label?: string;
  address?: string;
  coordinates?: [number, number];
  source?: string;
  message?: string;
};

const coordinatePattern = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;

const json = (body: GeocodeResponse, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": body.ok ? "public, max-age=86400" : "no-store",
    },
  });

const parseCoordinateText = (value: string): [number, number] | null => {
  const match = value.match(coordinatePattern);
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) return [second, first];
  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) return [first, second];
  return null;
};

const parseMapsInput = (input: string) => {
  const atMatch = input.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    return {
      coordinates: [Number(atMatch[2]), Number(atMatch[1])] as [number, number],
      query: "",
    };
  }

  try {
    const url = new URL(input);
    const queryFromPath = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/)?.[1] || "";
    const query =
      url.searchParams.get("q") ||
      url.searchParams.get("query") ||
      decodeURIComponent(queryFromPath.replace(/\+/g, " "));
    const coordinates = query ? parseCoordinateText(query) : null;
    return { coordinates: coordinates ?? undefined, query };
  } catch {
    return { query: input };
  }
};

const expandMapsShortUrl = async (input: string) => {
  if (!/^https:\/\/maps\.app\.goo\.gl\//.test(input)) return input;
  const response = await fetch(input, { redirect: "manual" });
  return response.headers.get("location") || input;
};

const geocodeWithNominatim = async (query: string): Promise<GeocodeResponse> => {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", query);

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": "travelji/1.0 (Cloudflare Pages; contact: travelji.pages.dev)",
      referer: "https://travelji.pages.dev/",
    },
  });

  if (!response.ok) {
    return { ok: false, message: "定位服务暂时不可用，请稍后再试。" };
  }

  const results = (await response.json()) as Array<{
    display_name?: string;
    lat?: string;
    lon?: string;
    name?: string;
  }>;
  const best = results[0];
  if (!best?.lat || !best.lon) {
    return { ok: false, message: "没有找到匹配地点，请换成更完整的地址或粘贴 Google Maps 链接。" };
  }

  return {
    ok: true,
    label: best.name || best.display_name || query,
    address: best.display_name || query,
    coordinates: [Number(best.lon), Number(best.lat)],
    source: "nominatim",
  };
};

const geocodeInput = async (input: string): Promise<GeocodeResponse> => {
  const directCoordinates = parseCoordinateText(input);
  if (directCoordinates) {
    return {
      ok: true,
      label: "坐标",
      address: input,
      coordinates: directCoordinates,
      source: "direct",
    };
  }

  const expandedInput = await expandMapsShortUrl(input);
  const parsed = parseMapsInput(expandedInput);
  if (parsed.coordinates) {
    return {
      ok: true,
      label: "Google Maps 坐标",
      address: parsed.query || expandedInput,
      coordinates: parsed.coordinates,
      source: "google-maps-url",
    };
  }

  const query = parsed.query || expandedInput || input;
  return geocodeWithNominatim(query);
};

export const onRequestPost: PagesFunction = async ({ request }) => {
  let input = "";
  try {
    const body = (await request.json()) as { input?: unknown };
    input = typeof body.input === "string" ? body.input.trim() : "";
  } catch {
    return json({ ok: false, message: "请求格式不正确。" }, 400);
  }

  if (!input) return json({ ok: false, message: "请先输入地址或地图链接。" }, 400);

  try {
    return json(await geocodeInput(input));
  } catch {
    return json({ ok: false, message: "定位失败，请稍后再试或手动输入经纬度。" }, 500);
  }
};

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const input = url.searchParams.get("input")?.trim();
  if (!input) return json({ ok: false, message: "请提供 input 参数。" }, 400);

  try {
    return json(await geocodeInput(input));
  } catch {
    return json({ ok: false, message: "定位失败，请稍后再试或手动输入经纬度。" }, 500);
  }
};
