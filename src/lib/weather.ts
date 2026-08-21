import "server-only";

export interface MatchWeather {
  tempC: number;
  feelsLikeC: number | null;
  precipProb: number;
  windKph: number;
  code: number;
  label: string;
  timeLabel: string;
}

const WMO_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

/** Parse stored "hh:mm am/pm" into a 24h hour (0-23). Defaults to 21 (9pm). */
function matchHour24(matchTime: string): number {
  const m = String(matchTime ?? "").trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (!m) return 21;
  let h = Number(m[1]) % 12;
  if (m[3] === "pm") h += 12;
  return h;
}

function hourLabel(h: number): string {
  const period = h >= 12 ? "pm" : "am";
  let hr = h % 12;
  if (hr === 0) hr = 12;
  return `${hr} ${period}`;
}

function daysFromToday(playedOn: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${playedOn}T00:00:00`);
  if (Number.isNaN(target.getTime())) return NaN;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * Matchday forecast at the field location via Open-Meteo (free, no API key).
 * Returns null when there are no coordinates, the date is in the past, or it is
 * beyond the ~16-day forecast horizon.
 */
export async function getMatchWeather(
  lat: number | null,
  lng: number | null,
  playedOn: string,
  matchTime: string,
): Promise<MatchWeather | null> {
  if (lat == null || lng == null) return null;
  const offset = daysFromToday(playedOn);
  if (Number.isNaN(offset) || offset < 0 || offset > 15) return null;

  const targetHour = matchHour24(matchTime);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m` +
    `&wind_speed_unit=kmh&timezone=auto&start_date=${playedOn}&end_date=${playedOn}`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        apparent_temperature?: number[];
        precipitation_probability?: number[];
        weather_code?: number[];
        wind_speed_10m?: number[];
      };
    };
    const h = data.hourly;
    if (!h?.time || h.time.length === 0) return null;

    let idx = h.time.findIndex((t) => {
      const hr = Number(t.slice(11, 13));
      return hr === targetHour;
    });
    if (idx < 0) idx = Math.min(targetHour, h.time.length - 1);

    const code = Number(h.weather_code?.[idx] ?? 0);
    return {
      tempC: Math.round(Number(h.temperature_2m?.[idx] ?? 0)),
      feelsLikeC:
        h.apparent_temperature?.[idx] == null
          ? null
          : Math.round(Number(h.apparent_temperature[idx])),
      precipProb: Math.round(Number(h.precipitation_probability?.[idx] ?? 0)),
      windKph: Math.round(Number(h.wind_speed_10m?.[idx] ?? 0)),
      code,
      label: WMO_LABELS[code] ?? "—",
      timeLabel: hourLabel(targetHour),
    };
  } catch {
    return null;
  }
}
