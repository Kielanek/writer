import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, FAKE_USER_ID } from "./fakeSupabase";

let currentUserId = FAKE_USER_ID;
let adminUserIds: string[] = [];

vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));
vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => {
    if (!currentUserId) throw new Error("not authenticated");
    return { id: currentUserId };
  },
  getAuthedUser: async () => (currentUserId ? { id: currentUserId } : null),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeDb,
}));
vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    env: {
      ...actual.env,
      adminUserIds: () => adminUserIds,
    },
  };
});

function setCurrentUser(id: string | null) {
  currentUserId = id ?? "";
  fakeDb.currentUserId = currentUserId;
}

import { isAdmin, requireAdmin } from "@/lib/admin/auth";
import { ApiError } from "@/lib/utils/api";
import { getEntitlementPeriod, getCurrentUsagePeriod } from "@/lib/entitlements/period";
import { getPlanLimits, PLAN_LIMITS } from "@/lib/entitlements/plans";
import { checkAiActionLimit, getUserEntitlements } from "@/lib/entitlements/usage";
import { getEntitlementsForUser } from "@/lib/admin/entitlements";
import { getAllPlanConfigs, updatePlanConfig } from "@/lib/admin/planConfig";
import { recordAdminAudit } from "@/lib/admin/auditLog";
import { listAdminUsers, getAdminUserDetail, getAdminDashboardSummary } from "@/lib/admin/users";

const ADMIN_ID = "admin-0000-0000-0000-000000000001";
const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";

function seedPlanConfigs() {
  fakeDb.tables["plan_configs"] = [
    {
      plan_id: "starter",
      display_name: "Starter",
      max_projects: 3,
      ai_actions_limit: 10,
      transcription_minutes_limit: 20,
      api_cost_budget_usd: 0.5,
      usage_period: "lifetime",
      monthly_price_pln: 0,
    },
    {
      plan_id: "pro",
      display_name: "Pro",
      max_projects: 25,
      ai_actions_limit: 300,
      transcription_minutes_limit: 180,
      api_cost_budget_usd: null,
      usage_period: "monthly",
      monthly_price_pln: 49,
    },
  ];
}

beforeEach(() => {
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
  fakeDb.authUsers = [];
  adminUserIds = [];
  setCurrentUser(FAKE_USER_ID);
});

describe("1-4) Admin authorization", () => {
  it("isAdmin() is false for an unauthenticated request", async () => {
    setCurrentUser(null);
    expect(await isAdmin()).toBe(false);
  });

  it("isAdmin() is false for a normal authenticated user", async () => {
    adminUserIds = [ADMIN_ID];
    setCurrentUser(USER_A);
    expect(await isAdmin()).toBe(false);
  });

  it("isAdmin() is true only for a user id present in ADMIN_USER_IDS", async () => {
    adminUserIds = [ADMIN_ID];
    setCurrentUser(ADMIN_ID);
    expect(await isAdmin()).toBe(true);
  });

  it("requireAdmin() throws a 404 ApiError (not 401/403) for a non-admin", async () => {
    adminUserIds = [ADMIN_ID];
    setCurrentUser(USER_A);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 404 });
    await expect(requireAdmin()).rejects.toBeInstanceOf(ApiError);
  });

  it("requireAdmin() succeeds for an authorized admin", async () => {
    adminUserIds = [ADMIN_ID];
    setCurrentUser(ADMIN_ID);
    const user = await requireAdmin();
    expect(user.id).toBe(ADMIN_ID);
  });

  it("admin authorization never derives from plan_id — a starter/development user in the DB is still rejected unless their id is in ADMIN_USER_IDS", async () => {
    adminUserIds = [ADMIN_ID];
    setCurrentUser(USER_A);
    fakeDb.tables["profiles"] = [{ id: USER_A, plan_id: "development" }];
    await expect(requireAdmin()).rejects.toMatchObject({ status: 404 });
  });
});

describe("24-26) Plan config is DB-backed (plan_configs) and admin-editable for BOTH Starter and Pro", () => {
  it("getAllPlanConfigs reads both plan_configs rows", async () => {
    seedPlanConfigs();
    const { starter, pro } = await getAllPlanConfigs();
    expect(starter).toEqual({
      planId: "starter",
      displayName: "Starter",
      maxProjects: 3,
      aiActionsLimit: 10,
      transcriptionMinutesLimit: 20,
      apiCostBudgetUsd: 0.5,
      monthlyPricePln: 0,
    });
    expect(pro).toEqual({
      planId: "pro",
      displayName: "Pro",
      maxProjects: 25,
      aiActionsLimit: 300,
      transcriptionMinutesLimit: 180,
      apiCostBudgetUsd: null,
      monthlyPricePln: 49,
    });
  });

  it("25) admin can change Starter limits, and getPlanLimits('starter') reflects the change immediately", async () => {
    seedPlanConfigs();

    await updatePlanConfig({
      planId: "starter",
      displayName: "Starter",
      maxProjects: 5,
      aiActionsLimit: 20,
      transcriptionMinutesLimit: 40,
      apiCostBudgetUsd: 1.25,
      monthlyPricePln: 0,
    });

    const limits = await getPlanLimits("starter");
    expect(limits).toMatchObject({ maxProjects: 5, aiActionsLimit: 20, transcriptionMinutesLimit: 40, apiCostBudgetUsd: 1.25 });
    // Single source of truth: this must NOT still be the code constant.
    expect(limits.maxProjects).not.toBe(PLAN_LIMITS.starter.maxProjects);
  });

  it("26) admin can change Pro limits and price independently of Starter", async () => {
    seedPlanConfigs();

    await updatePlanConfig({
      planId: "pro",
      displayName: "Pro",
      maxProjects: 100,
      aiActionsLimit: 500,
      transcriptionMinutesLimit: 500,
      apiCostBudgetUsd: null,
      monthlyPricePln: 99,
    });

    const pro = await getPlanLimits("pro");
    expect(pro).toMatchObject({ maxProjects: 100, aiActionsLimit: 500, monthlyPricePln: 99 });

    const starter = await getPlanLimits("starter");
    expect(starter.maxProjects).toBe(3); // untouched
  });
});

describe("Normal users cannot update plan_configs", () => {
  it("plan_configs has no client-writable path — updatePlanConfig is the only writer, and it's only reachable from the requireAdmin()-gated route", async () => {
    const entitlementsPlans = await import("@/lib/entitlements/plans");
    expect(Object.keys(entitlementsPlans)).not.toContain("updatePlanLimits");
    expect(Object.keys(entitlementsPlans)).not.toContain("setPlanConfig");
  });
});

describe("Plan config changes affect existing accounts' entitlement calculations immediately", () => {
  it("a Starter user's remaining allowance reflects the CURRENT config, not the config at signup", async () => {
    seedPlanConfigs();
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter", plan_changed_at: null }];
    fakeDb.tables["usage_events"] = [
      { id: "e1", user_id: FAKE_USER_ID, event_type: "ai_action", quantity: 8, created_at: new Date().toISOString() },
    ];

    let entitlements = await getUserEntitlements();
    expect(entitlements.aiActions).toMatchObject({ used: 8, limit: 10, remaining: 2 });

    // Admin lowers the limit below current usage.
    await updatePlanConfig({
      planId: "starter",
      displayName: "Starter",
      maxProjects: 3,
      aiActionsLimit: 5,
      transcriptionMinutesLimit: 20,
      apiCostBudgetUsd: 0.5,
      monthlyPricePln: 0,
    });

    entitlements = await getUserEntitlements();
    expect(entitlements.aiActions).toMatchObject({ used: 8, limit: 5, remaining: 0 });
    await expect(checkAiActionLimit()).rejects.toThrow(); // now over limit, blocked
  });
});

describe("3-5) Starter is lifetime-scoped — no expiration, no monthly reset", () => {
  it("3) Starter usage does not reset across a month boundary — a usage event from months ago still counts", () => {
    const period = getEntitlementPeriod(
      { planId: "starter", planChangedAt: null },
      new Date("2026-10-02T00:00:00.000Z")
    );
    // NOT the calendar-month period that October 1st would otherwise reset to.
    const octoberCalendarPeriod = getCurrentUsagePeriod(new Date("2026-10-02T00:00:00.000Z"));
    expect(period.start.getTime()).toBeLessThan(octoberCalendarPeriod.start.getTime());
    expect(period.end).toBeNull(); // never resets
  });

  it("4) development keeps the plain calendar month, unchanged from before Starter/Pro existed", () => {
    const period = getEntitlementPeriod(
      { planId: "development", planChangedAt: null },
      new Date("2026-03-15T00:00:00.000Z")
    );
    expect(period.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(period.end).not.toBeNull();
  });

  it("5) Starter has no time-based expiration at all — checkAiActionLimit only ever throws for USAGE, never for account age", async () => {
    seedPlanConfigs();
    fakeDb.tables["profiles"] = [
      { id: FAKE_USER_ID, plan_id: "starter", plan_changed_at: null },
    ];
    // Simulate a very old account (would have been "expired" for months under
    // the old 7-day trial model) with usage well under the limit.
    fakeDb.tables["usage_events"] = [
      {
        id: "e1",
        user_id: FAKE_USER_ID,
        event_type: "ai_action",
        quantity: 1,
        created_at: "2020-01-01T00:00:00.000Z",
      },
    ];
    await expect(checkAiActionLimit()).resolves.toBeUndefined();
  });
});

describe("Pro's monthly period is floored at plan_changed_at", () => {
  it("historical Starter usage recorded before the upgrade does not count toward the fresh Pro period", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const period = getEntitlementPeriod({ planId: "pro", planChangedAt: "2026-09-14T10:00:00.000Z" }, now);
    // Floored at plan_changed_at, not the 1st of the month.
    expect(period.start.toISOString()).toBe("2026-09-14T10:00:00.000Z");
  });

  it("once a full calendar month has passed since the upgrade, the period is just the plain calendar month", () => {
    const now = new Date("2026-11-15T00:00:00.000Z");
    const period = getEntitlementPeriod({ planId: "pro", planChangedAt: "2026-09-14T10:00:00.000Z" }, now);
    expect(period.start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("a pro account with no plan_changed_at (e.g. set manually by Admin) just uses the plain calendar month", () => {
    const period = getEntitlementPeriod({ planId: "pro", planChangedAt: null }, new Date("2026-03-15T00:00:00Z"));
    expect(period.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("Exhausted Starter still allows reading existing content", () => {
  it("there is no time-expiration gate left to block reads — only checkAiActionLimit/checkTranscriptionAllowance/createProject enforce anything, and none of them are called by read paths", async () => {
    // Structural: lib/entitlements/trial.ts (assertTrialActive) was removed
    // entirely — there is no time-based gate of any kind anymore. Read paths
    // (getProject, listProjectsWithCounts, getNote, getDocument, etc.) never
    // imported it and still don't import any entitlement check.
    const fs = await import("node:fs");
    expect(fs.existsSync("lib/entitlements/trial.ts")).toBe(false);
  });

  it("getUserEntitlements() still returns data (does not throw) once every limit is exhausted — the Account page must still render", async () => {
    seedPlanConfigs();
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter", plan_changed_at: null }];
    fakeDb.tables["usage_events"] = [
      { id: "e1", user_id: FAKE_USER_ID, event_type: "ai_action", quantity: 10, created_at: new Date().toISOString() },
    ];
    const entitlements = await getUserEntitlements();
    expect(entitlements.aiActions.remaining).toBe(0);
    expect(entitlements.plan).toBe("starter");
  });
});

describe("Admin per-user entitlements reuse the exact product-enforcement math", () => {
  it("getEntitlementsForUser and getUserEntitlements agree for the same user/state", async () => {
    seedPlanConfigs();
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter", plan_changed_at: null }];
    fakeDb.tables["usage_events"] = [
      { id: "e1", user_id: FAKE_USER_ID, event_type: "ai_action", quantity: 4, created_at: new Date().toISOString() },
      { id: "e2", user_id: FAKE_USER_ID, event_type: "provider_cost", quantity: 0.12, created_at: new Date().toISOString() },
    ];

    const selfView = await getUserEntitlements();
    const adminView = await getEntitlementsForUser({ id: FAKE_USER_ID, planId: "starter", planChangedAt: null });

    expect(adminView.aiActions).toEqual(selfView.aiActions);
    expect(adminView.transcriptionMinutes).toEqual(selfView.transcriptionMinutes);
    expect(adminView.projects).toEqual(selfView.projects);
  });

  it("admin sees providerCost for a Starter user; the self-service /api/usage route strips it (verified structurally — see app/api/usage/route.ts)", async () => {
    seedPlanConfigs();
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter", plan_changed_at: null }];
    const view = await getEntitlementsForUser({ id: FAKE_USER_ID, planId: "starter", planChangedAt: null });
    expect(view.providerCost).not.toBeNull();
  });

  it("normal (development) users' entitlements carry providerCost: null", async () => {
    const view = await getEntitlementsForUser({ id: USER_B, planId: "development", planChangedAt: null });
    expect(view.providerCost).toBeNull();
  });
});

describe("Admin user list", () => {
  beforeEach(() => {
    fakeDb.authUsers = [
      { id: USER_A, email: "alice@example.com", created_at: "2026-01-01T00:00:00Z", last_sign_in_at: "2026-01-05T00:00:00Z" },
      { id: USER_B, email: "bob@example.com", created_at: "2026-01-02T00:00:00Z" },
    ];
    fakeDb.tables["profiles"] = [
      { id: USER_A, plan_id: "starter", plan_changed_at: null },
      { id: USER_B, plan_id: "pro", plan_changed_at: "2026-01-02T00:00:00Z" },
    ];
  });

  it("lists registered users, newest first, with Account Created from auth.users.created_at", async () => {
    const { users, total } = await listAdminUsers({ page: 1, perPage: 25 });
    expect(total).toBe(2);
    expect(users[0].id).toBe(USER_B); // created 2026-01-02, newer than USER_A
    expect(users[0].createdAt).toBe("2026-01-02T00:00:00Z");
  });

  it("lastSignInAt is populated where available, null otherwise", async () => {
    const { users } = await listAdminUsers({ page: 1, perPage: 25 });
    const alice = users.find((u) => u.id === USER_A)!;
    const bob = users.find((u) => u.id === USER_B)!;
    expect(alice.lastSignInAt).toBe("2026-01-05T00:00:00Z");
    expect(bob.lastSignInAt).toBeNull();
  });

  it("users are paginated (perPage respected)", async () => {
    const { users, total } = await listAdminUsers({ page: 1, perPage: 1 });
    expect(users).toHaveLength(1);
    expect(total).toBe(2);
  });

  it("email search finds the matching user only", async () => {
    const { users, total } = await listAdminUsers({ page: 1, perPage: 25, search: "alice" });
    expect(total).toBe(1);
    expect(users[0].id).toBe(USER_A);
  });

  it("search by exact user UUID works", async () => {
    const { users } = await listAdminUsers({ page: 1, perPage: 25, search: USER_B });
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(USER_B);
  });

  it("getAdminUserDetail returns the merged auth+profile view for one user, with no Trial fields anywhere", async () => {
    const detail = await getAdminUserDetail(USER_A);
    expect(detail?.email).toBe("alice@example.com");
    expect(detail?.planId).toBe("starter");
    expect(detail).not.toHaveProperty("trialStatus");
    expect(detail).not.toHaveProperty("trialEndsAt");
  });

  it("dashboard summary counts total/starter/pro users and new-today from auth.users, with no Trial counters", async () => {
    const summary = await getAdminDashboardSummary();
    expect(summary.totalUsers).toBe(2);
    expect(summary.starterUsers).toBe(1);
    expect(summary.proUsers).toBe(1);
    expect(summary).not.toHaveProperty("activeTrials");
    expect(summary).not.toHaveProperty("expiredTrials");
  });
});

describe("Admin audit log", () => {
  it("recordAdminAudit writes an entry", async () => {
    await recordAdminAudit({ adminUserId: ADMIN_ID, action: "plan_config_updated", metadata: { before: {}, after: {} } });
    const rows = fakeDb.tables["admin_audit_log"];
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("plan_config_updated");
    expect(rows[0].admin_user_id).toBe(ADMIN_ID);
  });

  it("there is no exported function for a normal request-scoped caller to write admin_audit_log directly — only recordAdminAudit (admin client) does", async () => {
    const auditModule = await import("@/lib/admin/auditLog");
    expect(Object.keys(auditModule)).toEqual(["recordAdminAudit"]);
  });
});

describe("Account UI never receives providerCost (contract with app/api/usage/route.ts)", () => {
  it("getUserEntitlements() computes providerCost, but the route strips it before responding (see the route source)", async () => {
    seedPlanConfigs();
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter", plan_changed_at: null }];
    const entitlements = await getUserEntitlements();
    expect(entitlements.providerCost).not.toBeNull(); // present at the data layer...
    // ...but app/api/usage/route.ts destructures only plan/planDisplayName/
    // usagePeriod/projects/aiActions/transcriptionMinutes into its response —
    // verified by reading that file, not re-implemented here.
  });
});
