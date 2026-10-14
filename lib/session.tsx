"use client";

// SESSION: who is using the app on this device.
//
//   Farm login   -> proves the device belongs to the farm (Supabase)
//   Device setup -> Personal (remembers one person) or Shared (asks)
//   Person       -> stamps their name on work and sets the language
//
// The device setting is saved in the browser on this device only.
// A shared device forgets the person after 30 minutes of no use.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase, getMyFarm, Farm, Person } from "@/lib/supabase";
import { translate, Key, Lang } from "@/lib/i18n";

const DEVICE_KEY = "fs.device";
const ACTIVE_KEY = "fs.active";
const LANG_KEY = "fs.lang";
const SHARED_TIMEOUT_MS = 30 * 60 * 1000;

export type DeviceMode = "personal" | "shared";
type DeviceSetting = { mode: DeviceMode; personId: string | null } | null;
type ActivePerson = { personId: string; at: number } | null;

type Status = "loading" | "signed_out" | "no_farm" | "ready";

type SessionValue = {
  status: Status;
  farm: Farm | null;
  people: Person[]; // everyone, active and inactive
  activePeople: Person[];
  person: Person | null;
  device: DeviceSetting;
  lang: Lang;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  selectPerson: (personId: string) => void;
  clearPerson: () => void;
  setDevice: (mode: DeviceMode, personId: string | null) => void;
  setLang: (lang: Lang) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

// ---------- Safe browser storage (never crashes the app) ----------
function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the app still works, it just won't remember */
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("loading");
  const [farm, setFarm] = useState<Farm | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [device, setDeviceState] = useState<DeviceSetting>(null);
  const [active, setActive] = useState<ActivePerson>(null);
  const [savedLang, setSavedLang] = useState<Lang>("en");

  // Load everything once, and again whenever the login changes
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setFarm(null);
      setPeople([]);
      setStatus("signed_out");
      return;
    }
    const myFarm = await getMyFarm();
    if (!myFarm) {
      setFarm(null);
      setStatus("no_farm");
      return;
    }
    const { data: crew } = await supabase
      .from("people")
      .select("*")
      .order("name");
    setFarm(myFarm);
    setPeople((crew as Person[]) || []);
    setStatus("ready");
  }, []);

  useEffect(() => {
    setDeviceState(readJSON<DeviceSetting>(DEVICE_KEY));
    setActive(readJSON<ActivePerson>(ACTIVE_KEY));
    const l = readJSON<Lang>(LANG_KEY);
    if (l === "en" || l === "es") setSavedLang(l);
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  // Who is working right now?
  const person = useMemo<Person | null>(() => {
    const find = (id: string | null | undefined) =>
      people.find((p) => p.id === id && p.is_active) || null;
    if (device?.mode === "personal") return find(device.personId);
    if (active && Date.now() - active.at < SHARED_TIMEOUT_MS) {
      return find(active.personId);
    }
    return null;
  }, [people, device, active]);

  // On a shared device, each page visit counts as activity
  useEffect(() => {
    if (device?.mode !== "personal" && person) {
      const next = { personId: person.id, at: Date.now() };
      writeJSON(ACTIVE_KEY, next);
      setActive(next);
    }
  }, [pathname, device, person]);

  // Coming back to the app after a while: re-check the 30-minute limit
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === "visible") {
        setActive(readJSON<ActivePerson>(ACTIVE_KEY));
      }
    };
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, []);

  const selectPerson = useCallback(
    (personId: string) => {
      const next = { personId, at: Date.now() };
      writeJSON(ACTIVE_KEY, next);
      setActive(next);
      if (device?.mode === "personal") {
        const d = { mode: "personal" as const, personId };
        writeJSON(DEVICE_KEY, d);
        setDeviceState(d);
      }
    },
    [device]
  );

  const clearPerson = useCallback(() => {
    writeJSON(ACTIVE_KEY, null);
    setActive(null);
  }, []);

  const setDevice = useCallback((mode: DeviceMode, personId: string | null) => {
    const d = { mode, personId: mode === "personal" ? personId : null };
    writeJSON(DEVICE_KEY, d);
    setDeviceState(d);
    if (personId) {
      const next = { personId, at: Date.now() };
      writeJSON(ACTIVE_KEY, next);
      setActive(next);
    }
  }, []);

  const lang: Lang = person?.language || savedLang;

  const setLang = useCallback((l: Lang) => {
    writeJSON(LANG_KEY, l);
    setSavedLang(l);
  }, []);

  const t = useCallback(
    (key: Key, vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang]
  );

  const signOut = useCallback(async () => {
    writeJSON(ACTIVE_KEY, null);
    setActive(null);
    await supabase.auth.signOut();
  }, []);

  const signOutAll = useCallback(async () => {
    writeJSON(ACTIVE_KEY, null);
    setActive(null);
    await supabase.auth.signOut({ scope: "global" });
  }, []);

  const value: SessionValue = {
    status,
    farm,
    people,
    activePeople: people.filter((p) => p.is_active),
    person,
    device,
    lang,
    t,
    selectPerson,
    clearPerson,
    setDevice,
    setLang,
    refresh,
    signOut,
    signOutAll,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

// Pages that need a signed-in farm (Settings works before any people exist).
// Returns true once it's safe to show the page.
export function useRequireFarm(): boolean {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "signed_out") router.replace("/login");
    if (status === "no_farm") router.replace("/setup");
  }, [status, router]);
  return status === "ready";
}

// Pages where work gets logged: also need to know who's working.
export function useRequirePerson(): boolean {
  const { status, person } = useSession();
  const farmReady = useRequireFarm();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === "ready" && !person) {
      router.replace(`/who?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, person, router, pathname]);
  return farmReady && !!person;
}
