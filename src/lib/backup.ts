/**
 * A full copy of the database, table by table (hardening plan H7.3; Jon, Nov 11 2026: "Set up
 * the weekly backup to Google Drive").
 *
 * Why not pg_dump: the copy is pulled by a Google Apps Script running as Jon (docs/backup.md),
 * and the only thing it can reach is this app. So the app writes each table as one line of JSON
 * per row, exactly as Postgres itself prints the row (`row_to_json`), and reads it back with
 * Postgres's own `json_populate_recordset`. Postgres does both conversions, so dates, JSON
 * columns, arrays and enums come back as they went out.
 *
 * Every function takes the database to work on, so the round trip is tested between two
 * databases (backup.test.ts). A backup nobody has restored is only a hope.
 */
import { sql, type SQL } from "drizzle-orm";

/** The one thing these functions need from a database, whichever driver it is. */
export type SqlRunner = { execute: (query: SQL) => Promise<unknown> };

/** Tables that hold nothing worth keeping: counters that empty themselves. */
const SKIP = new Set(["auth_throttle"]);

const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;
export const BACKUP_BATCH = 2000;

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}

/** Double-quoted identifier, only ever for names read from the database's own catalog. */
function ident(name: string): SQL {
  if (!SAFE_NAME.test(name)) throw new Error(`unexpected table or column name: ${name}`);
  return sql.raw(`"${name}"`);
}

/** Every table of the app, by name. */
export async function listBackupTables(db: SqlRunner): Promise<string[]> {
  const rows = rowsOf<{ table_name: string }>(
    await db.execute(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`)
  );
  return rows.map((r) => r.table_name).filter((t) => SAFE_NAME.test(t) && !SKIP.has(t));
}

async function primaryKey(db: SqlRunner, table: string): Promise<string[]> {
  const rows = rowsOf<{ column_name: string }>(
    await db.execute(sql`
      select kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      where tc.table_schema = 'public' and tc.table_name = ${table}
        and tc.constraint_type = 'PRIMARY KEY'
      order by kcu.ordinal_position`)
  );
  return rows.map((r) => r.column_name);
}

/** One batch of a table as JSON text, one string per row, in primary-key order. */
async function exportBatch(
  db: SqlRunner,
  table: string,
  order: string[],
  offset: number
): Promise<string[]> {
  const by = order.length ? sql.join(order.map(ident), sql`, `) : sql`1`;
  const rows = rowsOf<{ j: string }>(
    await db.execute(
      sql`select row_to_json(t)::text as j from ${ident(table)} t order by ${by} limit ${BACKUP_BATCH} offset ${offset}`
    )
  );
  return rows.map((r) => r.j);
}

/** A table's rows, one JSON line each, a batch at a time (so a big table never sits in memory whole). */
export async function* exportTable(db: SqlRunner, table: string): AsyncGenerator<string[]> {
  const order = await primaryKey(db, table);
  for (let offset = 0; ; offset += BACKUP_BATCH) {
    const lines = await exportBatch(db, table, order, offset);
    if (lines.length) yield lines;
    if (lines.length < BACKUP_BATCH) return;
  }
}

export type BackupManifest = {
  app: "bloom";
  format: 1;
  takenAt: string;
  /** How many migrations the database had, so a restore goes into a matching schema. */
  migrations: number | null;
  tables: { name: string; rows: number }[];
};

/** What a backup should contain: every table and its row count right now. */
export async function backupManifest(db: SqlRunner, now = new Date()): Promise<BackupManifest> {
  const tables: BackupManifest["tables"] = [];
  for (const name of await listBackupTables(db)) {
    const [row] = rowsOf<{ n: number }>(
      await db.execute(sql`select count(*)::int as n from ${ident(name)}`)
    );
    tables.push({ name, rows: row?.n ?? 0 });
  }
  let migrations: number | null = null;
  try {
    const [m] = rowsOf<{ n: number }>(
      await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)
    );
    migrations = m?.n ?? null;
  } catch {
    /* a database made without drizzle-kit has no such table */
  }
  return { app: "bloom", format: 1, takenAt: now.toISOString(), migrations, tables };
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

type ForeignKey = { table: string; column: string; refTable: string };

async function foreignKeys(db: SqlRunner): Promise<ForeignKey[]> {
  return rowsOf<{ t: string; c: string; r: string }>(
    await db.execute(sql`
      select cl.relname as t, att.attname as c, rcl.relname as r
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_class rcl on rcl.oid = con.confrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
      where con.contype = 'f' and ns.nspname = 'public'`)
  ).map((r) => ({ table: r.t, column: r.c, refTable: r.r }));
}

/**
 * The order to load tables in: a table after everything it points at. Where tables point at
 * each other in a ring (or a table points at itself), those links are returned as `late`:
 * the rows go in with that column empty, and it is filled in once every table is loaded.
 */
export function restoreOrder(
  tables: string[],
  fks: ForeignKey[]
): { order: string[]; late: ForeignKey[] } {
  const known = new Set(tables);
  const late: ForeignKey[] = [];
  let links = fks.filter((f) => known.has(f.table) && known.has(f.refTable));
  for (const f of links) if (f.table === f.refTable) late.push(f);
  links = links.filter((f) => f.table !== f.refTable);
  const order: string[] = [];
  const left = new Set(tables);
  while (left.size) {
    const ready = [...left]
      .filter((t) => !links.some((f) => f.table === t && left.has(f.refTable)))
      .sort();
    if (ready.length) {
      for (const t of ready) {
        order.push(t);
        left.delete(t);
      }
      continue;
    }
    // A ring: cut one link (alphabetically first, so the result is the same every time).
    const cut = links
      .filter((f) => left.has(f.table) && left.has(f.refTable))
      .sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`))[0];
    late.push(cut);
    links = links.filter((f) => f !== cut);
  }
  return { order, late };
}

/**
 * Load a backup into an EMPTY database that already has the schema (`npm run db:migrate`).
 * `read(table)` yields the table's JSON lines in batches. Returns the rows loaded per table.
 * Refuses a database that already holds accounts: a restore never overwrites.
 */
export async function restoreBackup(
  db: SqlRunner,
  manifest: BackupManifest,
  read: (table: string) => AsyncIterable<string[]>
): Promise<Record<string, number>> {
  const [existing] = rowsOf<{ n: number }>(
    await db.execute(sql`select count(*)::int as n from "users"`)
  );
  if ((existing?.n ?? 0) > 0)
    throw new Error("This database already has accounts. Restore only into an empty one.");
  const present = new Set(await listBackupTables(db));
  const tables = manifest.tables.map((t) => t.name).filter((t) => present.has(t));
  const { order, late } = restoreOrder(tables, await foreignKeys(db));
  const pks = new Map<string, string[]>();
  const loaded: Record<string, number> = {};
  const held: { fk: ForeignKey; rows: Record<string, unknown>[] }[] = [];

  for (const table of order) {
    const lateCols = late.filter((f) => f.table === table);
    if (lateCols.length) pks.set(table, await primaryKey(db, table));
    loaded[table] = 0;
    for await (const lines of read(table)) {
      if (lines.length === 0) continue;
      let rows = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
      if (lateCols.length) {
        for (const fk of lateCols) {
          const keep = rows.filter((r) => r[fk.column] !== null && r[fk.column] !== undefined);
          if (keep.length)
            held.push({
              fk,
              rows: keep.map((r) => ({
                ...Object.fromEntries(pks.get(table)!.map((k) => [k, r[k]])),
                [fk.column]: r[fk.column],
              })),
            });
        }
        rows = rows.map((r) => ({
          ...r,
          ...Object.fromEntries(lateCols.map((f) => [f.column, null])),
        }));
      }
      await db.execute(
        sql`insert into ${ident(table)} select * from json_populate_recordset(null::${ident(table)}, ${JSON.stringify(rows)}::json)`
      );
      loaded[table] += rows.length;
    }
  }

  // The links that were left empty, now that every row they point at exists. The trigger that
  // stamps updated_at is switched off for this, so the restored rows keep their own times.
  for (const { fk, rows } of held) {
    const pk = pks.get(fk.table)!;
    const match = sql.join(
      pk.map((k) => sql`t.${ident(k)} = v.${ident(k)}`),
      sql` and `
    );
    await db.execute(sql`alter table ${ident(fk.table)} disable trigger user`);
    try {
      await db.execute(
        sql`update ${ident(fk.table)} t set ${ident(fk.column)} = v.${ident(fk.column)}
            from json_populate_recordset(null::${ident(fk.table)}, ${JSON.stringify(rows)}::json) v
            where ${match}`
      );
    } finally {
      await db.execute(sql`alter table ${ident(fk.table)} enable trigger user`);
    }
  }
  return loaded;
}
