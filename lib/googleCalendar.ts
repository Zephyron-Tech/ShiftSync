import { listEvents } from "./ics";
import type { Person } from "./parsePdf";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (c: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }) => TokenClient;
        };
      };
    };
  }
}

export type GCalendar = { id: string; name: string; primary: boolean };

function loadGis(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Přihlášení Google se nepodařilo načíst."));
    document.head.appendChild(s);
  });
}

/** Opens the Google consent popup; resolves with a short-lived access token (kept only in memory). */
export async function googleSignIn(): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error("Google přihlášení není nastavené.");
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error ?? "Přihlášení se nezdařilo."))),
      error_callback: (e) => reject(new Error(e.type === "popup_closed" ? "Přihlášení bylo zrušeno." : "Přihlášení se nezdařilo.")),
    });
    client.requestAccessToken();
  });
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Google Kalendář odpověděl chybou ${res.status}.`);
  return res.json() as Promise<T>;
}

export async function listWritableCalendars(token: string): Promise<GCalendar[]> {
  const r = await api<{ items: { id: string; summary: string; summaryOverride?: string; primary?: boolean }[] }>(
    token,
    "/users/me/calendarList?minAccessRole=writer",
  );
  return r.items.map((c) => ({ id: c.id, name: c.summaryOverride ?? c.summary, primary: !!c.primary }));
}

/**
 * Adds the shifts with events.import and the shift's stable UID as iCalUID, so running it
 * again updates the same events instead of duplicating them.
 */
export async function importShifts(token: string, calendarId: string, person: Person, year: number, month: number, onProgress: (done: number, total: number) => void) {
  const events = listEvents(person, year, month);
  let done = 0;
  const queue = [...events];
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const body = e.startTime
        ? {
            iCalUID: e.uid,
            summary: e.summary,
            description: e.description,
            start: { dateTime: `${e.date}T${e.startTime}:00`, timeZone: "Europe/Prague" },
            end: { dateTime: `${e.endDate}T${e.endTime}:00`, timeZone: "Europe/Prague" },
          }
        : {
            iCalUID: e.uid,
            summary: e.summary,
            description: e.description,
            start: { date: e.date },
            end: { date: e.endDate },
            transparency: "transparent",
          };
      await api(token, `/calendars/${encodeURIComponent(calendarId)}/events/import`, { method: "POST", body: JSON.stringify(body) });
      onProgress(++done, events.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
