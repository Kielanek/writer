import { randomUUID } from "crypto";

/**
 * A minimal in-memory stand-in for the Supabase JS client, supporting just
 * the query shapes used by lib/db/*.ts and lib/entitlements/*.ts. Good
 * enough to unit-test our data access + context-isolation logic without a
 * real Postgres instance.
 *
 * Foreign-key cascade behavior (on delete cascade) is emulated here to
 * mirror supabase/migrations/0001_init.sql, but the migration itself is the
 * source of truth — see tests/schema-cascade.test.ts for a check that the
 * SQL actually declares those cascades.
 *
 * Real Postgres RLS enforcement is NOT emulated here — this fake only
 * understands plain column filters. Cross-user isolation via the
 * application-layer `.eq("user_id", ...)` filtering is verified in
 * tests/ownership-isolation.test.ts (using this fake with a switchable
 * mocked user); the actual RLS policies are verified separately, directly
 * against Postgres, by supabase/tests/rls_verification.sql. Most tests
 * here mock `@/lib/supabase/auth` to a single fixed user (FAKE_USER_ID).
 */

/** The single fixed user every vi.mock("@/lib/supabase/auth", ...) in this test suite resolves to, unless a test overrides fakeDb.currentUserId (see tests/ownership-isolation.test.ts). */
export const FAKE_USER_ID = "00000000-0000-0000-0000-000000000001";

type Row = Record<string, unknown>;
type Filter = { col: string; type: "eq" | "in" | "gte" | "lt"; value: unknown };

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private insertData?: Row;
  private updateData?: Row;
  private orderCol?: string;
  private orderAsc = true;
  private countRequested = false;
  private headOnly = false;

  constructor(
    private table: string,
    private db: FakeSupabaseClient
  ) {}

  select(_cols?: string, opts?: { count?: "exact"; head?: boolean }) {
    this.countRequested = Boolean(opts?.count);
    this.headOnly = Boolean(opts?.head);
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

  gte(col: string, value: unknown) {
    this.filters.push({ col, type: "gte", value });
    return this;
  }

  lt(col: string, value: unknown) {
    this.filters.push({ col, type: "lt", value });
    return this;
  }

  is(col: string, value: unknown) {
    this.filters.push({ col, type: "eq", value });
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

  then<TResult1 = { data: unknown; error: null; count?: number }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec()
      .then((rows) => ({
        data: this.headOnly ? null : rows,
        error: null,
        ...(this.countRequested ? { count: rows.length } : {}),
      }))
      .then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      if (f.type === "eq") return row[f.col] === f.value;
      if (f.type === "in") return (f.value as unknown[]).includes(row[f.col]);
      if (f.type === "gte") return (row[f.col] as string | number) >= (f.value as string | number);
      if (f.type === "lt") return (row[f.col] as string | number) < (f.value as string | number);
      return true;
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

    const readable = matched.filter((r) => this.db.rlsSelectAllows(this.table, r));

    let result = readable;
    if (this.orderCol) {
      const col = this.orderCol;
      result = [...readable].sort((a, b) => {
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

/**
 * Return value of FakeSupabaseClient.rpc(): usable either directly awaited
 * (matching e.g. `await supabase.rpc("get_usage_total", ...)`) or chained
 * with `.single()` (matching `await supabase.rpc("create_document_version", ...).single()`),
 * since real callers in this codebase use both styles.
 */
class FakeRpcResult<T> implements PromiseLike<{ data: T; error: { message: string } | null }> {
  constructor(private result: { data: T; error: { message: string } | null }) {}

  then<TResult1 = { data: T; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: T; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }

  single() {
    return Promise.resolve(this.result);
  }
}

export class FakeSupabaseClient {
  tables: Record<string, Row[]> = {};
  /**
   * Simulates `auth.uid()` for RPCs whose real Postgres implementation
   * derives ownership from the session rather than a parameter (e.g.
   * create_project_with_limit, get_usage_total). Tests that impersonate
   * multiple users (tests/ownership-isolation.test.ts) must keep this in
   * sync with whatever their `@/lib/supabase/auth` mock currently returns.
   */
  currentUserId: string = FAKE_USER_ID;

  /**
   * Minimal stand-in for the GoTrue Admin API (lib/admin/users.ts's only
   * dependency beyond plain table queries). Tests seed this array directly
   * — see tests/admin.test.ts.
   */
  authUsers: { id: string; email?: string; created_at: string; last_sign_in_at?: string }[] = [];

  auth = {
    admin: {
      listUsers: async ({ page = 1, perPage = 1000 }: { page?: number; perPage?: number } = {}) => {
        const start = (page - 1) * perPage;
        const users = this.authUsers.slice(start, start + perPage);
        const lastPage = Math.max(1, Math.ceil(this.authUsers.length / perPage));
        return {
          data: {
            users,
            aud: "authenticated",
            total: this.authUsers.length,
            lastPage,
            nextPage: page < lastPage ? page + 1 : null,
          },
          error: null,
        };
      },
      getUserById: async (id: string) => {
        const user = this.authUsers.find((u) => u.id === id);
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "Not found" } };
      },
    },
  };

  from(table: string) {
    return new FakeQueryBuilder(table, this);
  }

  /**
   * Read-only RLS emulation for `select` queries against Project-scoped
   * tables (projects/notes/documents/document_versions/
   * project_chat_messages) — mirrors can_access_project() (owner or
   * member), matching lib/db/*.ts's removal of application-layer
   * `.eq("user_id", ...)` filters in favor of RLS alone. Fails OPEN when the
   * referenced project isn't present in the fake `projects` table at all,
   * since many tests exercise these tables (e.g. tests/document-versions.test.ts,
   * tests/seo-meta.test.ts) without fully modeling `projects` — only tests
   * that specifically assert cross-user isolation
   * (tests/ownership-isolation.test.ts) seed a real `projects` row, so those
   * get properly gated.
   */
  rlsSelectAllows(table: string, row: Row): boolean {
    const userId = this.currentUserId;
    const canAccess = (projectId: unknown): boolean => {
      if (!projectId) return true;
      const project = this.tables["projects"]?.find((p) => p.id === projectId);
      if (!project) return true;
      if (project.owner_id === userId) return true;
      const members = this.tables["project_members"] ?? [];
      return members.some((m) => m.project_id === projectId && m.user_id === userId);
    };

    switch (table) {
      case "projects":
        return canAccess(row.id);
      case "notes":
      case "documents":
      case "project_chat_messages":
        return canAccess(row.project_id);
      case "document_versions": {
        const doc = this.tables["documents"]?.find((d) => d.id === row.document_id);
        return doc ? canAccess(doc.project_id) : true;
      }
      default:
        return true;
    }
  }

  /** Mirrors get_owner_seat_usage()'s SQL: owner + distinct member emails + distinct pending-invite emails, deduped by email, all scoped to Projects this owner owns. */
  computeSeatUsage(ownerId: string): number {
    const emailOf = (userId: string) => this.authUsers.find((u) => u.id === userId)?.email?.toLowerCase();

    const identities = new Set<string>();
    const ownerEmail = emailOf(ownerId);
    if (ownerEmail) identities.add(ownerEmail);

    const projects = this.tables["projects"] ?? [];
    const ownedProjectIds = new Set(projects.filter((p) => p.owner_id === ownerId).map((p) => p.id as string));

    const members = this.tables["project_members"] ?? [];
    for (const m of members) {
      if (ownedProjectIds.has(m.project_id as string)) {
        const email = emailOf(m.user_id as string);
        if (email) identities.add(email);
      }
    }

    const invitations = this.tables["project_invitations"] ?? [];
    const now = new Date();
    for (const inv of invitations) {
      if (
        ownedProjectIds.has(inv.project_id as string) &&
        inv.status === "pending" &&
        new Date(inv.expires_at as string) > now
      ) {
        identities.add((inv.email as string).toLowerCase());
      }
    }

    return identities.size;
  }

  rpc(fnName: string, args: Record<string, unknown>) {
    if (fnName === "create_document_version") {
      const documentId = args.p_document_id as string;
      const versions = this.tables["document_versions"] ?? (this.tables["document_versions"] = []);
      const existing = versions.filter((v) => v.document_id === documentId);
      const nextVersion = existing.length
        ? Math.max(...existing.map((v) => v.version_number as number)) + 1
        : 1;

      const newVersion: Row = {
        id: randomUUID(),
        document_id: documentId,
        user_id: this.currentUserId,
        version_number: nextVersion,
        content: args.p_content,
        source: args.p_source,
        instruction: args.p_instruction ?? null,
        restored_from_version: args.p_restored_from_version ?? null,
        seo_settings: args.p_seo_settings ?? null,
        created_at: new Date().toISOString(),
      };
      versions.push(newVersion);

      const docs = this.tables["documents"] ?? [];
      const doc = docs.find((d) => d.id === documentId);
      if (doc) {
        doc.content = args.p_content;
        if (args.p_seo_settings != null) doc.seo_settings = args.p_seo_settings;
        doc.updated_at = new Date().toISOString();
      }

      return new FakeRpcResult({ data: newVersion, error: null });
    }

    if (fnName === "create_project_with_limit") {
      const projects = this.tables["projects"] ?? (this.tables["projects"] = []);
      const maxProjects = args.p_max_projects as number;
      const existingCount = projects.filter((p) => p.owner_id === this.currentUserId).length;

      if (existingCount >= maxProjects) {
        return new FakeRpcResult({ data: null, error: { message: "project_limit_reached" } });
      }

      const now = new Date().toISOString();
      const newRow: Row = {
        id: randomUUID(),
        user_id: this.currentUserId,
        owner_id: this.currentUserId,
        name: args.p_name,
        description: args.p_description ?? null,
        created_at: now,
        updated_at: now,
      };
      projects.push(newRow);
      return new FakeRpcResult({ data: newRow, error: null });
    }

    if (fnName === "get_usage_total") {
      const eventType = args.p_event_type as string;
      const periodStart = args.p_period_start as string;
      const events = this.tables["usage_events"] ?? [];
      const total = events
        .filter(
          (e) =>
            e.user_id === this.currentUserId &&
            e.event_type === eventType &&
            (e.created_at as string) >= periodStart
        )
        .reduce((sum, e) => sum + Number(e.quantity), 0);
      return new FakeRpcResult({ data: total, error: null });
    }

    if (fnName === "reserve_provider_budget") {
      const billingUserId = args.p_user_id as string;
      const reservations =
        this.tables["provider_cost_reservations"] ?? (this.tables["provider_cost_reservations"] = []);
      const events = this.tables["usage_events"] ?? [];

      const completedCost = events
        .filter((e) => e.user_id === billingUserId && e.event_type === "provider_cost")
        .reduce((sum, e) => sum + Number(e.quantity), 0);
      const reservedCost = reservations
        .filter((r) => r.user_id === billingUserId && r.status === "reserved")
        .reduce((sum, r) => sum + Number(r.reserved_cost_usd), 0);

      const budgetLimit = args.p_budget_limit_usd as number;
      const reservedCostUsd = args.p_reserved_cost_usd as number;

      if (completedCost + reservedCost + reservedCostUsd > budgetLimit) {
        return new FakeRpcResult({ data: null, error: { message: "provider_budget_exhausted" } });
      }

      const now = new Date().toISOString();
      const newRow: Row = {
        id: randomUUID(),
        user_id: billingUserId,
        feature: args.p_feature,
        reserved_cost_usd: reservedCostUsd,
        actual_cost_usd: null,
        status: "reserved",
        created_at: now,
        completed_at: null,
      };
      reservations.push(newRow);
      return new FakeRpcResult({ data: newRow, error: null });
    }

    if (fnName === "reconcile_provider_reservation") {
      const billingUserId = args.p_user_id as string;
      const reservations = this.tables["provider_cost_reservations"] ?? [];
      const reservation = reservations.find(
        (r) => r.id === args.p_reservation_id && r.user_id === billingUserId && r.status === "reserved"
      );
      if (!reservation) {
        return new FakeRpcResult({ data: null, error: { message: "reservation_not_found" } });
      }

      reservation.status = "completed";
      reservation.actual_cost_usd = args.p_actual_cost_usd;
      reservation.completed_at = new Date().toISOString();

      const events = this.tables["usage_events"] ?? (this.tables["usage_events"] = []);
      events.push({
        id: randomUUID(),
        user_id: billingUserId,
        actor_user_id: (args.p_actor_user_id as string) ?? billingUserId,
        project_id: args.p_project_id ?? null,
        event_type: "provider_cost",
        quantity: args.p_actual_cost_usd,
        metadata: { ...(args.p_metadata as object), feature: reservation.feature },
        created_at: new Date().toISOString(),
      });

      return new FakeRpcResult({ data: reservation, error: null });
    }

    if (fnName === "release_provider_reservation") {
      const billingUserId = args.p_user_id as string;
      const reservations = this.tables["provider_cost_reservations"] ?? [];
      const reservation = reservations.find(
        (r) => r.id === args.p_reservation_id && r.user_id === billingUserId && r.status === "reserved"
      );
      if (reservation) {
        reservation.status = "released";
        reservation.completed_at = new Date().toISOString();
      }
      return new FakeRpcResult({ data: null, error: null });
    }

    if (fnName === "get_provider_cost_total") {
      const billingUserId = args.p_user_id as string;
      const events = this.tables["usage_events"] ?? [];
      const total = events
        .filter((e) => e.user_id === billingUserId && e.event_type === "provider_cost")
        .reduce((sum, e) => sum + Number(e.quantity), 0);
      return new FakeRpcResult({ data: total, error: null });
    }

    if (fnName === "get_owner_seat_usage") {
      return new FakeRpcResult({ data: this.computeSeatUsage(args.p_owner_id as string), error: null });
    }

    if (fnName === "invite_project_member") {
      const actor = this.currentUserId;
      const projectId = args.p_project_id as string;
      const email = (args.p_email as string).trim().toLowerCase();

      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return new FakeRpcResult({ data: null, error: { message: "invalid_email" } });
      }

      const projects = this.tables["projects"] ?? [];
      const project = projects.find((p) => p.id === projectId);
      if (!project) return new FakeRpcResult({ data: null, error: { message: "project_not_found" } });
      if (project.owner_id !== actor) return new FakeRpcResult({ data: null, error: { message: "not_project_owner" } });

      const ownerEmail = this.authUsers.find((u) => u.id === project.owner_id)?.email?.toLowerCase();
      if (email === ownerEmail) return new FakeRpcResult({ data: null, error: { message: "cannot_invite_owner" } });

      const members = this.tables["project_members"] ?? (this.tables["project_members"] = []);
      const alreadyMember = members.some(
        (m) =>
          m.project_id === projectId &&
          this.authUsers.find((u) => u.id === m.user_id)?.email?.toLowerCase() === email
      );
      if (alreadyMember) return new FakeRpcResult({ data: null, error: { message: "already_member" } });

      const invitations = this.tables["project_invitations"] ?? (this.tables["project_invitations"] = []);
      const now = new Date();
      const alreadyInvited = invitations.some(
        (inv) =>
          inv.project_id === projectId &&
          inv.email === email &&
          inv.status === "pending" &&
          new Date(inv.expires_at as string) > now
      );
      if (alreadyInvited) return new FakeRpcResult({ data: null, error: { message: "already_invited" } });

      const ownedProjectIds = new Set(projects.filter((p) => p.owner_id === project.owner_id).map((p) => p.id as string));
      const alreadySeated =
        members.some(
          (m) =>
            ownedProjectIds.has(m.project_id as string) &&
            this.authUsers.find((u) => u.id === m.user_id)?.email?.toLowerCase() === email
        ) ||
        invitations.some(
          (inv) =>
            ownedProjectIds.has(inv.project_id as string) &&
            inv.email === email &&
            inv.status === "pending" &&
            new Date(inv.expires_at as string) > now
        );

      if (!alreadySeated) {
        const planConfigs = this.tables["plan_configs"] ?? [];
        const profiles = this.tables["profiles"] ?? [];
        const ownerPlanId = (profiles.find((p) => p.id === project.owner_id)?.plan_id as string) ?? "development";
        const planConfig = planConfigs.find((c) => c.plan_id === ownerPlanId);
        const seatLimit =
          (planConfig?.seat_limit as number | undefined) ??
          (ownerPlanId === "starter" ? 1 : ownerPlanId === "pro" ? 3 : Number.MAX_SAFE_INTEGER);

        const seatUsage = this.computeSeatUsage(project.owner_id as string);

        if (seatUsage >= seatLimit) {
          return new FakeRpcResult({ data: null, error: { message: "seat_limit_reached" } });
        }
      }

      const newInvitation: Row = {
        id: randomUUID(),
        project_id: projectId,
        email,
        invited_by: actor,
        role: "member",
        status: "pending",
        expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        created_at: new Date().toISOString(),
        accepted_at: null,
        accepted_by: null,
      };
      invitations.push(newInvitation);
      return new FakeRpcResult({ data: newInvitation, error: null });
    }

    if (fnName === "accept_project_invitation") {
      const actor = this.currentUserId;
      const invitations = this.tables["project_invitations"] ?? [];
      const invitation = invitations.find((inv) => inv.id === args.p_invitation_id);
      if (!invitation) return new FakeRpcResult({ data: null, error: { message: "invitation_not_found" } });
      if (invitation.status !== "pending") {
        return new FakeRpcResult({ data: null, error: { message: "invitation_not_pending" } });
      }
      if (new Date(invitation.expires_at as string) <= new Date()) {
        invitation.status = "expired";
        return new FakeRpcResult({ data: null, error: { message: "invitation_expired" } });
      }
      const actorEmail = this.authUsers.find((u) => u.id === actor)?.email?.toLowerCase();
      if (actorEmail !== invitation.email) {
        return new FakeRpcResult({ data: null, error: { message: "invitation_email_mismatch" } });
      }

      const projects = this.tables["projects"] ?? [];
      const project = projects.find((p) => p.id === invitation.project_id);
      if (!project) return new FakeRpcResult({ data: null, error: { message: "project_not_found" } });
      if (project.owner_id === actor) return new FakeRpcResult({ data: null, error: { message: "cannot_invite_owner" } });

      const members = this.tables["project_members"] ?? (this.tables["project_members"] = []);
      let member = members.find((m) => m.project_id === invitation.project_id && m.user_id === actor);
      if (!member) {
        member = {
          id: randomUUID(),
          project_id: invitation.project_id,
          user_id: actor,
          role: "member",
          added_by: invitation.invited_by,
          created_at: new Date().toISOString(),
        };
        members.push(member);
      }

      invitation.status = "accepted";
      invitation.accepted_at = new Date().toISOString();
      invitation.accepted_by = actor;

      return new FakeRpcResult({ data: member, error: null });
    }

    if (fnName === "decline_project_invitation" || fnName === "revoke_project_invitation") {
      const invitations = this.tables["project_invitations"] ?? [];
      const invitation = invitations.find((inv) => inv.id === args.p_invitation_id);
      if (!invitation) return new FakeRpcResult({ data: null, error: { message: "invitation_not_found" } });

      if (fnName === "revoke_project_invitation") {
        const projects = this.tables["projects"] ?? [];
        const project = projects.find((p) => p.id === invitation.project_id);
        if (project && project.owner_id !== this.currentUserId) {
          return new FakeRpcResult({ data: null, error: { message: "not_project_owner" } });
        }
      }

      if (invitation.status === "pending") invitation.status = "revoked";
      return new FakeRpcResult({ data: null, error: null });
    }

    if (fnName === "remove_project_member") {
      const projects = this.tables["projects"] ?? [];
      const project = projects.find((p) => p.id === args.p_project_id);
      if (!project) return new FakeRpcResult({ data: null, error: { message: "project_not_found" } });
      if (project.owner_id !== this.currentUserId) {
        return new FakeRpcResult({ data: null, error: { message: "not_project_owner" } });
      }
      this.tables["project_members"] = (this.tables["project_members"] ?? []).filter(
        (m) => !(m.project_id === args.p_project_id && m.user_id === args.p_member_user_id)
      );
      return new FakeRpcResult({ data: null, error: null });
    }

    if (fnName === "leave_project") {
      const projects = this.tables["projects"] ?? [];
      const project = projects.find((p) => p.id === args.p_project_id);
      if (!project) return new FakeRpcResult({ data: null, error: { message: "project_not_found" } });
      if (project.owner_id === this.currentUserId) {
        return new FakeRpcResult({ data: null, error: { message: "owner_cannot_leave" } });
      }
      this.tables["project_members"] = (this.tables["project_members"] ?? []).filter(
        (m) => !(m.project_id === args.p_project_id && m.user_id === this.currentUserId)
      );
      return new FakeRpcResult({ data: null, error: null });
    }

    if (fnName === "is_project_owner") {
      const projects = this.tables["projects"] ?? [];
      const project = projects.find((p) => p.id === args.p_project_id);
      return new FakeRpcResult({ data: Boolean(project && project.owner_id === args.p_user_id), error: null });
    }

    if (fnName === "can_access_project") {
      const projects = this.tables["projects"] ?? [];
      const project = projects.find((p) => p.id === args.p_project_id);
      const isOwner = Boolean(project && project.owner_id === args.p_user_id);
      const members = this.tables["project_members"] ?? [];
      const isMember = members.some((m) => m.project_id === args.p_project_id && m.user_id === args.p_user_id);
      return new FakeRpcResult({ data: isOwner || isMember, error: null });
    }

    throw new Error(`Unknown rpc: ${fnName}`);
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
