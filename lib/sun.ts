// NOAA sunrise equation. Plzeň by default; returns local (Europe/Prague) decimal hours.
const RAD = Math.PI / 180;

function localHours(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return get("hour") + get("minute") / 60;
}

export function daylight(year: number, month: number, day: number, lat = 49.7384, lon = 13.3736) {
  const jd = Date.UTC(year, month - 1, day, 12) / 86400000 + 2440587.5;
  const n = Math.ceil(jd - 2451545.0 + 0.0008);
  const js = n - lon / 360;
  const m = (357.5291 + 0.98560028 * js) % 360;
  const c = 1.9148 * Math.sin(m * RAD) + 0.02 * Math.sin(2 * m * RAD) + 0.0003 * Math.sin(3 * m * RAD);
  const lambda = (m + c + 180 + 102.9372) % 360;
  const transit = 2451545.0 + js + 0.0053 * Math.sin(m * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const decl = Math.asin(Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD));
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl));
  const w = Math.acos(Math.max(-1, Math.min(1, cosW))) / RAD;
  const toMs = (j: number) => (j - 2440587.5) * 86400000;
  return { rise: localHours(toMs(transit - w / 360)), set: localHours(toMs(transit + w / 360)) };
}

export const fmtClock = (h: number) => {
  const t = Math.round(h * 60);
  return `${Math.floor(t / 60) % 24}:${String(t % 60).padStart(2, "0")}`;
};
