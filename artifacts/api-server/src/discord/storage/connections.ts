import { promises as fs } from "node:fs";
import path from "node:path";

export type ServerRole = "staff" | "main";

export interface PendingConnection {
  id: string;
  fromGuildId: string;
  toGuildId: string;
  declaredFromRole: ServerRole; // role of the requesting (from) guild
  requestedBy: string;
  requestedAt: number;
}

export interface ActiveConnection {
  staffGuildId: string;
  mainGuildId: string;
  establishedAt: number;
  approvedBy: string;
}

interface ConnectionsStore {
  pending: PendingConnection[];
  active: ActiveConnection[];
}

const DATA_DIR = path.resolve(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "connections.json");

let cache: ConnectionsStore | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<ConnectionsStore> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    cache = JSON.parse(raw) as ConnectionsStore;
    if (!Array.isArray(cache.pending)) cache.pending = [];
    if (!Array.isArray(cache.active)) cache.active = [];
  } catch {
    cache = { pending: [], active: [] };
  }
  return cache;
}

async function persist(data: ConnectionsStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function queueWrite(data: ConnectionsStore): Promise<void> {
  writeQueue = writeQueue.then(() => persist(data)).catch(() => {});
  return writeQueue;
}

export async function listPending(): Promise<PendingConnection[]> {
  const d = await load();
  return [...d.pending];
}

export async function listActive(): Promise<ActiveConnection[]> {
  const d = await load();
  return [...d.active];
}

export async function createPending(
  fromGuildId: string,
  toGuildId: string,
  declaredFromRole: ServerRole,
  requestedBy: string,
): Promise<PendingConnection> {
  const d = await load();
  // Cancel any existing pending in either direction between these two guilds.
  d.pending = d.pending.filter(
    (p) =>
      !(
        (p.fromGuildId === fromGuildId && p.toGuildId === toGuildId) ||
        (p.fromGuildId === toGuildId && p.toGuildId === fromGuildId)
      ),
  );
  const entry: PendingConnection = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    fromGuildId,
    toGuildId,
    declaredFromRole,
    requestedBy,
    requestedAt: Date.now(),
  };
  d.pending.push(entry);
  await queueWrite(d);
  return entry;
}

export async function findPendingByGuilds(
  guildAId: string,
  guildBId: string,
): Promise<PendingConnection | null> {
  const d = await load();
  return (
    d.pending.find(
      (p) =>
        (p.fromGuildId === guildAId && p.toGuildId === guildBId) ||
        (p.fromGuildId === guildBId && p.toGuildId === guildAId),
    ) ?? null
  );
}

export async function approvePending(
  pendingId: string,
  approvedByUserId: string,
): Promise<ActiveConnection | null> {
  const d = await load();
  const idx = d.pending.findIndex((p) => p.id === pendingId);
  if (idx === -1) return null;
  const p = d.pending.splice(idx, 1)[0]!;
  // Remove any existing connections involving either guild first.
  d.active = d.active.filter(
    (a) =>
      a.staffGuildId !== p.fromGuildId &&
      a.staffGuildId !== p.toGuildId &&
      a.mainGuildId !== p.fromGuildId &&
      a.mainGuildId !== p.toGuildId,
  );
  const staffGuildId =
    p.declaredFromRole === "staff" ? p.fromGuildId : p.toGuildId;
  const mainGuildId =
    p.declaredFromRole === "main" ? p.fromGuildId : p.toGuildId;
  const active: ActiveConnection = {
    staffGuildId,
    mainGuildId,
    establishedAt: Date.now(),
    approvedBy: approvedByUserId,
  };
  d.active.push(active);
  await queueWrite(d);
  return active;
}

export async function rejectPending(pendingId: string): Promise<boolean> {
  const d = await load();
  const idx = d.pending.findIndex((p) => p.id === pendingId);
  if (idx === -1) return false;
  d.pending.splice(idx, 1);
  await queueWrite(d);
  return true;
}

export async function disconnectGuild(guildId: string): Promise<boolean> {
  const d = await load();
  const before = d.active.length;
  d.active = d.active.filter(
    (a) => a.staffGuildId !== guildId && a.mainGuildId !== guildId,
  );
  if (d.active.length === before) return false;
  await queueWrite(d);
  return true;
}

export async function getConnectedGuildId(
  guildId: string,
): Promise<{ otherGuildId: string; role: ServerRole; mainGuildId: string } | null> {
  const d = await load();
  const a = d.active.find(
    (x) => x.staffGuildId === guildId || x.mainGuildId === guildId,
  );
  if (!a) return null;
  if (a.staffGuildId === guildId) {
    return {
      otherGuildId: a.mainGuildId,
      role: "staff",
      mainGuildId: a.mainGuildId,
    };
  }
  return {
    otherGuildId: a.staffGuildId,
    role: "main",
    mainGuildId: a.mainGuildId,
  };
}
