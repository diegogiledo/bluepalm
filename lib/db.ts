import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PACKAGE_SEED, ZIP_SEED } from "./config";
import type { Tables, TableName } from "./types";

/**
 * Minimal table store with two backends:
 *  - Supabase (Postgres) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 *  - A local JSON file (./data/dev-db.json) otherwise, for local development.
 * All access is server-side only. Filters are simple equality matches.
 */
type Filter<T> = Partial<T>;
type Store = {
  select<K extends TableName>(t: K, f?: Filter<Tables[K]>): Promise<Tables[K][]>;
  insert<K extends TableName>(t: K, row: Tables[K]): Promise<Tables[K]>;
  insertMany<K extends TableName>(t: K, rows: Tables[K][]): Promise<void>;
  update<K extends TableName>(t: K, f: Filter<Tables[K]>, patch: Partial<Tables[K]>): Promise<Tables[K][]>;
  remove<K extends TableName>(t: K, f: Filter<Tables[K]>): Promise<void>;
};

export const isSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// ---------- JSON file backend ----------
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "dev-db.json");
type Mem = { [K in TableName]: Tables[K][] };
const EMPTY: Mem = {
  packages: [], service_zips: [], settings: [], customers: [], detailers: [], bookings: [],
  recurring_plans: [], messages: [], outbox: [], staff: [], market_detailers: [], job_offers: [],
};
let mem: Mem | null = null;
let queue: Promise<unknown> = Promise.resolve();

let loadedMtime = 0;
// The dev server can load this module more than once (route handlers and
// pages), so reload whenever another instance has written the file.
async function load(): Promise<Mem> {
  let mtime = 0;
  try { mtime = (await fs.stat(DB_FILE)).mtimeMs; } catch {}
  if (mem && mtime === loadedMtime) return mem;
  try {
    mem = { ...EMPTY, ...JSON.parse(await fs.readFile(DB_FILE, "utf8")) } as Mem;
  } catch {
    mem ??= structuredClone(EMPTY);
  }
  loadedMtime = mtime;
  return mem;
}
async function persist() {
  // Hosted serverless platforms have read-only, non-persistent disks.
  if (process.env.NETLIFY || process.env.VERCEL) {
    if (seeding) return; // seed data can live in memory so read-only pages still render
    throw new Error("Local JSON storage can't be used on a hosted deploy. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(mem, null, 2));
  await fs.rename(tmp, DB_FILE);
  try { loadedMtime = (await fs.stat(DB_FILE)).mtimeMs; } catch {}
}
function matches(row: Record<string, unknown>, f?: Record<string, unknown>) {
  if (!f) return true;
  return Object.entries(f).every(([k, v]) => v === undefined || row[k] === v);
}
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const jsonStore: Store = {
  async select(t, f) {
    const db = await load();
    return structuredClone((db[t] as Record<string, unknown>[]).filter((r) => matches(r, f as never))) as never;
  },
  insert(t, row) {
    return serial(async () => {
      const db = await load();
      (db[t] as unknown[]).push(structuredClone(row));
      await persist();
      return row;
    });
  },
  insertMany(t, rows) {
    return serial(async () => {
      const db = await load();
      (db[t] as unknown[]).push(...structuredClone(rows));
      await persist();
    });
  },
  update(t, f, patch) {
    return serial(async () => {
      const db = await load();
      const out: unknown[] = [];
      for (const r of db[t] as Record<string, unknown>[]) {
        if (matches(r, f as never)) { Object.assign(r, patch); out.push(structuredClone(r)); }
      }
      await persist();
      return out as never;
    });
  },
  remove(t, f) {
    return serial(async () => {
      const db = await load();
      (db as Record<string, unknown[]>)[t] = (db[t] as Record<string, unknown>[]).filter((r) => !matches(r, f as never));
      await persist();
    });
  },
};

// ---------- Supabase backend ----------
let sb: SupabaseClient | null = null;
function client() {
  if (!sb) sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  return sb;
}
function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Database error: ${r.error.message}`);
  return r.data;
}
const supabaseStore: Store = {
  async select(t, f) {
    let q = client().from(t).select("*");
    if (f) q = q.match(f as Record<string, unknown>);
    return (check(await q) ?? []) as never;
  },
  async insert(t, row) {
    return check(await client().from(t).insert(row as never).select().single()) as never;
  },
  async insertMany(t, rows) {
    if (rows.length) check(await client().from(t).insert(rows as never[]));
  },
  async update(t, f, patch) {
    return (check(await client().from(t).update(patch as never).match(f as Record<string, unknown>).select()) ?? []) as never;
  },
  async remove(t, f) {
    check(await client().from(t).delete().match(f as Record<string, unknown>));
  },
};

const store: Store = isSupabase ? supabaseStore : jsonStore;

// ---------- Seed (idempotent) ----------
let seeded: Promise<void> | null = null;
let seeding = false;
function ensureSeed() {
  if (!seeded) {
    seeding = true;
    seeded = (async () => {
      if ((await store.select("packages")).length === 0) {
        await store.insertMany("packages", PACKAGE_SEED.map((p) => ({ ...p })));
      }
      if ((await store.select("service_zips")).length === 0) {
        await store.insertMany("service_zips", ZIP_SEED.map((z) => ({ ...z, enabled: true })));
      }
      if ((await store.select("settings")).length === 0) {
        await store.insertMany("settings", [
          { key: "commission_rate", value: 0.2 },
          { key: "loyalty_points_per_dollar", value: 1 },
        ]);
      }
    })().catch((e) => { seeded = null; throw e; }).finally(() => { seeding = false; });
  }
  return seeded;
}

export const db: Store = {
  async select(t, f) { await ensureSeed(); return store.select(t, f); },
  async insert(t, r) { await ensureSeed(); return store.insert(t, r); },
  async insertMany(t, r) { await ensureSeed(); return store.insertMany(t, r); },
  async update(t, f, p) { await ensureSeed(); return store.update(t, f, p); },
  async remove(t, f) { await ensureSeed(); return store.remove(t, f); },
};

export async function one<K extends TableName>(t: K, f: Filter<Tables[K]>): Promise<Tables[K] | null> {
  return (await db.select(t, f))[0] ?? null;
}

export async function getSetting<T = number>(key: string, fallback: T): Promise<T> {
  const s = await one("settings", { key });
  return (s?.value as T) ?? fallback;
}
export async function setSetting(key: string, value: unknown) {
  const existing = await one("settings", { key });
  if (existing) await db.update("settings", { key }, { value });
  else await db.insert("settings", { key, value });
}
