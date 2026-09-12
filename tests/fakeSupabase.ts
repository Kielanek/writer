import { randomUUID } from "crypto";

/**
 * A minimal in-memory stand-in for the Supabase JS client, supporting just
 * the query shapes used by lib/db/*.ts. Good enough to unit-test our data
 * access + context-isolation logic without a real Postgres instance.
 *
 * Foreign-key cascade behavior (on delete cascade) is emulated here to
 * mirror supabase/migrations/0001_init.sql, but the migration itself is the
 * source of truth — see tests/schema-cascade.test.ts for a check that the
 * SQL actually declares those cascades.
 */

type Row = Record<string, unknown>;
type Filter = { col: string; type: "eq" | "in"; value: unknown };

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private insertData?: Row;
  private updateData?: Row;
  private orderCol?: string;
  private orderAsc = true;

  constructor(
    private table: string,
    private db: FakeSupabaseClient
  ) {}

  select(_cols?: string) {
    return this;
  }

  eq(col: string, value: unknown) {
    this.filters.push({ col, type: "eq", value });
    return this;
  }

  in(col: string, value: unknown[]) {
    this.filters.push({ col, type: "in", value });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }

  insert(data: Row) {
    this.op = "insert";
    this.insertData = data;
    return this;
  }

  update(data: Row) {
    this.op = "update";
    this.updateData = data;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  async maybeSingle() {
    const rows = await this.exec();
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    const rows = await this.exec();
    if (rows.length === 0) return { data: null, error: { message: "Not found" } };
    return { data: rows[0], error: null };
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec()
      .then((rows) => ({ data: rows, error: null }))
      .then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      if (f.type === "eq") return row[f.col] === f.value;
      return (f.value as unknown[]).includes(row[f.col]);
    });
  }

  private async exec(): Promise<Row[]> {
    const now = new Date().toISOString();
    const rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);

    if (this.op === "insert") {
      const newRow: Row = { id: randomUUID(), created_at: now, updated_at: now, ...this.insertData };
      rows.push(newRow);
      return [newRow];
    }

    const matched = rows.filter((r) => this.matches(r));

    if (this.op === "update") {
      matched.forEach((r) => Object.assign(r, this.updateData, { updated_at: now }));
      return matched;
    }

    if (this.op === "delete") {
      this.db.tables[this.table] = rows.filter((r) => !matched.includes(r));
      this.db.cascadeDelete(this.table, matched);
      return matched;
    }

    let result = matched;
    if (this.orderCol) {
      const col = this.orderCol;
      result = [...matched].sort((a, b) => {
        const av = a[col] as string | number;
        const bv = b[col] as string | number;
        if (av < bv) return this.orderAsc ? -1 : 1;
        if (av > bv) return this.orderAsc ? 1 : -1;
        return 0;
      });
    }
    return result;
  }
}

export class FakeSupabaseClient {
  tables: Record<string, Row[]> = {};

  from(table: string) {
    return new FakeQueryBuilder(table, this);
  }

  rpc(fnName: string, args: Record<string, unknown>) {
    if (fnName !== "create_document_version") throw new Error(`Unknown rpc: ${fnName}`);

    const documentId = args.p_document_id as string;
    const versions = this.tables["document_versions"] ?? (this.tables["document_versions"] = []);
    const existing = versions.filter((v) => v.document_id === documentId);
    const nextVersion = existing.length
      ? Math.max(...existing.map((v) => v.version_number as number)) + 1
      : 1;

    const newVersion: Row = {
      id: randomUUID(),
      document_id: documentId,
      version_number: nextVersion,
      content: args.p_content,
      source: args.p_source,
      instruction: args.p_instruction ?? null,
      restored_from_version: args.p_restored_from_version ?? null,
      created_at: new Date().toISOString(),
    };
    versions.push(newVersion);

    const docs = this.tables["documents"] ?? [];
    const doc = docs.find((d) => d.id === documentId);
    if (doc) {
      doc.content = args.p_content;
      doc.updated_at = new Date().toISOString();
    }

    return { single: () => Promise.resolve({ data: newVersion, error: null }) };
  }

  cascadeDelete(table: string, deletedRows: Row[]) {
    if (table === "projects") {
      const ids = deletedRows.map((r) => r.id);
      this.tables["notes"] = (this.tables["notes"] ?? []).filter(
        (n) => !ids.includes(n.project_id)
      );
      const docs = this.tables["documents"] ?? [];
      const deletedDocIds = docs.filter((d) => ids.includes(d.project_id)).map((d) => d.id);
      this.tables["documents"] = docs.filter((d) => !ids.includes(d.project_id));
      this.tables["document_versions"] = (this.tables["document_versions"] ?? []).filter(
        (v) => !deletedDocIds.includes(v.document_id)
      );
      this.tables["project_chat_messages"] = (this.tables["project_chat_messages"] ?? []).filter(
        (m) => !ids.includes(m.project_id)
      );
    }
    if (table === "documents") {
      const ids = deletedRows.map((r) => r.id);
      this.tables["document_versions"] = (this.tables["document_versions"] ?? []).filter(
        (v) => !ids.includes(v.document_id)
      );
    }
  }
}

export const fakeDb = new FakeSupabaseClient();
