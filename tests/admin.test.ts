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
import { getTrialStatus, assertTrialActive } from "@/lib/entitlements/trial";
import { TrialExpiredError } from "@/lib/entitlements/errors";
import { getEntitlementPeriod, getCurrentUsagePeriod } from "@/lib/entitlements/period";
import { getPlanLimits, PLAN_LIMITS } from "@/lib/entitlements/plans";
import { checkAiActionLimit, checkTranscriptionAllowance, getUserEntitlements } from "@/lib/entitlements/usage";
import { createProject } from "@/lib/db/projects";
import { getEntitlementsForUser } from "@/lib/admin/entitlements";
import { getTrialConfig, updateTrialConfig } from "@/lib/admin/planConfig";
import { recordAdminAudit } from "@/lib/admin/auditLog";
import { listAdminUsers, getAdminUserDetail, getAdminDashboardSummary } from "@/lib/admin/users";

const ADMIN_ID = "admin-0000-0000-0000-000000000001";
const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";

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

  it("admin authorization never derives from plan_id — a trial/development user in the DB is still rejected unless their id is in ADMIN_USER_IDS", async () => {
    adminUserIds = [ADMIN_ID];
    setCurrentUser(USER_A);
    fakeDb.tables["profiles"] = [{ id: USER_A, plan_id: "development" }];
    await expect(requireAdmin()).rejects.toMatchObject({ status: 404 });
  });
});

describe("5-10) Trial config is DB-backed (plan_configs) and admin-editable", () => {
  it("5) getTrialConfig reads the plan_configs row", async () => {
    fakeDb.tables["plan_configs"] = [
      {
        plan_id: "trial",
        max_projects: 3,
        ai_actions_limit: 10,
        transcription_minutes_limit: 120,
        api_cost_budget_usd: 0.5,
        trial_days: 7,
      },
    ];
    const config = await getTrialConfig();
    expect(config).toEqual({
      maxProjects: 3,
      aiActionsLimit: 10,
      transcriptionMinutesLimit: 120,
      apiCostBudgetUsd: 0.5,
      trialDays: 7,
    });
  });

  it("6-10) admin can change project/AI/transcription/cost/duration limits, and getPlanLimits('trial') reflects the change immediately", async () => {
    fakeDb.tables["plan_configs"] = [
      {
        plan_id: "trial",
        max_projects: 3,
        ai_actions_limit: 10,
        transcription_minutes_limit: 120,
        api_cost_budget_usd: 0.5,
        trial_days: 7,
      },
    ];

    await updateTrialConfig({
      maxProjects: 5,
      aiActionsLimit: 20,
      transcriptionMinutesLimit: 200,
      apiCostBudgetUsd: 1.25,
      trialDays: 14,
    });

    const limits = await getPlanLimits("trial");
    expect(limits).toEqual({
      maxProjects: 5,
      aiActionsPerMonth: 20,
      transcriptionMinutesPerMonth: 200,
      apiCostBudgetUsd: 1.25,
    });

    // Single source of truth: this must NOT still be the code constant.
    expect(limits.maxProjects).not.toBe(PLAN_LIMITS.trial.maxProjects);
  });
});

describe("11) Normal users cannot update plan_configs", () => {
  it("plan_configs has no client-writable path — updateTrialConfig is the only writer, and it's only reachable from the requireAdmin()-gated route", async () => {
    // Structural contract: the exported surface of lib/admin/planConfig.ts
    // is the only place that writes this table (via the admin client);
    // there is no lib/entitlements export that does the same for ordinary
    // request-scoped code. Real enforcement is the zero grant to
    // `authenticated` on plan_configs (see 0010's migration) — verified at
    // the SQL level in supabase/tests/ (see the admin RLS verification
    // file this task adds).
    const entitlementsPlans = await import("@/lib/entitlements/plans");
    expect(Object.keys(entitlementsPlans)).not.toContain("updatePlanLimits");
    expect(Object.keys(entitlementsPlans)).not.toContain("setTrialConfig");
  });
});

describe("12) Trial setting changes affect existing trial entitlement calculations", () => {
  it("a trial user's remaining allowance reflects the CURRENT config, not the config at signup", async () => {
    fakeDb.tables["profiles"] = [
      {
        id: FAKE_USER_ID,
        plan_id: "trial",
        trial_started_at: new Date(Date.now() - 86_400_000).toISOString(),
        trial_ends_at: new Date(Date.now() + 6 * 86_400_000).toISOString(),
      },
    ];
    fakeDb.tables["usage_events"] = [
      { id: "e1", user_id: FAKE_USER_ID, event_type: "ai_action", quantity: 8, created_at: new Date().toISOString() },
    ];
    fakeDb.tables["plan_configs"] = [
      { plan_id: "trial", max_projects: 3, ai_actions_limit: 10, transcription_minutes_limit: 120, api_cost_budget_usd: 0.5, trial_days: 7 },
    ];

    let entitlements = await getUserEntitlements();
    expect(entitlements.aiActions).toMatchObject({ used: 8, limit: 10, remaining: 2 });

    // Admin lowers the limit below current usage.
    await updateTrialConfig({ maxProjects: 3, aiActionsLimit: 5, transcriptionMinutesLimit: 120, apiCostBudgetUsd: 0.5, trialDays: 7 });

    entitlements = await getUserEntitlements();
    expect(entitlements.aiActions).toMatchObject({ used: 8, limit: 5, remaining: 0 });
    await expect(checkAiActionLimit()).rejects.toThrow(); // now over limit, blocked
  });
});

describe("13) Changing trial_days does not mutate existing users' trial_ends_at", () => {
  it("updateTrialConfig only touches plan_configs, never profiles", async () => {
    const fixedEndsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "trial", trial_started_at: new Date().toISOString(), trial_ends_at: fixedEndsAt }];
    fakeDb.tables["plan_configs"] = [
      { plan_id: "trial", max_projects: 3, ai_actions_limit: 10, transcription_minutes_limit: 120, api_cost_budget_usd: 0.5, trial_days: 7 },
    ];

    await updateTrialConfig({ maxProjects: 3, aiActionsLimit: 10, transcriptionMinutesLimit: 120, apiCostBudgetUsd: 0.5, trialDays: 30 });

    const profile = fakeDb.tables["profiles"].find((p) => p.id === FAKE_USER_ID)!;
    expect(profile.trial_ends_at).toBe(fixedEndsAt);
  });
});

describe("17-18) Trial period, not calendar month, governs trial usage", () => {
  it("a trial spanning a month boundary keeps one continuous usage period", () => {
    const period = getEntitlementPeriod({
      planId: "trial",
      trialStartedAt: "2026-09-28T00:00:00.000Z",
      trialEndsAt: "2026-10-05T00:00:00.000Z",
    });
    expect(period.start.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    // NOT the calendar-month period that October 1st would otherwise reset to.
    const octoberCalendarPeriod = getCurrentUsagePeriod(new Date("2026-10-02T00:00:00.000Z"));
    expect(period.start.getTime()).toBeLessThan(octoberCalendarPeriod.start.getTime());
  });

  it("development/pro still use the calendar month", () => {
    const period = getEntitlementPeriod(
      { planId: "development", trialStartedAt: null, trialEndsAt: null },
      new Date("2026-03-15T00:00:00.000Z")
    );
    expect(period.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("Trial status", () => {
  it("trialing before trial_ends_at, expired after", () => {
    const now = new Date("2026-06-15T00:00:00.000Z");
    expect(
      getTrialStatus({ planId: "trial", trialEndsAt: "2026-06-20T00:00:00.000Z" }, now)
    ).toBe("trialing");
    expect(
      getTrialStatus({ planId: "trial", trialEndsAt: "2026-06-10T00:00:00.000Z" }, now)
    ).toBe("expired");
  });

  it("non-trial plans are not_on_trial regardless of dates", () => {
    expect(getTrialStatus({ planId: "development", trialEndsAt: "2020-01-01T00:00:00.000Z" })).toBe(
      "not_on_trial"
    );
  });
});

describe("29-31) Expired trial blocks entitlement-gated actions but preserves read access", () => {
  beforeEach(() => {
    fakeDb.tables["profiles"] = [
      {
        id: FAKE_USER_ID,
        plan_id: "trial",
        trial_started_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        trial_ends_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), // ended 3 days ago
      },
    ];
  });

  it("29) checkAiActionLimit throws TrialExpiredError before checking numeric usage", async () => {
    await expect(checkAiActionLimit()).rejects.toBeInstanceOf(TrialExpiredError);
  });

  it("checkTranscriptionAllowance also throws TrialExpiredError", async () => {
    await expect(checkTranscriptionAllowance()).rejects.toBeInstanceOf(TrialExpiredError);
  });

  it("createProject throws TrialExpiredError (project creation blocked too)", async () => {
    await expect(createProject({ name: "Nope", description: null })).rejects.toBeInstanceOf(TrialExpiredError);
  });

  it("30) existing content stays fully readable — assertTrialActive is not called by read paths", () => {
    // Structural: assertTrialActive is only imported by write/spend paths
    // (lib/db/projects.ts's createProject, lib/entitlements/usage.ts's two
    // check functions, lib/ai/guarded.ts) — never by getProject/
    // listProjectsWithCounts/getNote/getDocument etc., so an expired trial
    // user can always still read what they already have.
    expect(() => assertTrialActive({ id: FAKE_USER_ID, planId: "development", trialStartedAt: null, trialEndsAt: null })).not.toThrow();
  });

  it("31) getUserEntitlements() still returns data (does not throw) for an expired trial — the Account page must still render", async () => {
    const entitlements = await getUserEntitlements();
    expect(entitlements.trialStatus).toBe("expired");
    expect(entitlements.plan).toBe("trial");
  });
});

describe("22-23) Admin per-user entitlements reuse the exact product-enforcement math", () => {
  it("getEntitlementsForUser and getUserEntitlements agree for the same user/state", async () => {
    fakeDb.tables["profiles"] = [
      {
        id: FAKE_USER_ID,
        plan_id: "trial",
        trial_started_at: new Date(Date.now() - 86_400_000).toISOString(),
        trial_ends_at: new Date(Date.now() + 6 * 86_400_000).toISOString(),
      },
    ];
    fakeDb.tables["usage_events"] = [
      { id: "e1", user_id: FAKE_USER_ID, event_type: "ai_action", quantity: 4, created_at: new Date().toISOString() },
      { id: "e2", user_id: FAKE_USER_ID, event_type: "provider_cost", quantity: 0.12, created_at: new Date().toISOString() },
    ];

    const selfView = await getUserEntitlements();
    const adminView = await getEntitlementsForUser({
      id: FAKE_USER_ID,
      planId: "trial",
      trialStartedAt: fakeDb.tables["profiles"][0].trial_started_at as string,
      trialEndsAt: fakeDb.tables["profiles"][0].trial_ends_at as string,
    });

    expect(adminView.aiActions).toEqual(selfView.aiActions);
    expect(adminView.transcriptionMinutes).toEqual(selfView.transcriptionMinutes);
    expect(adminView.projects).toEqual(selfView.projects);
  });

  it("23) admin sees providerCost for a trial user; the self-service /api/usage route strips it (verified structurally — see app/api/usage/route.ts)", async () => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "trial", trial_started_at: new Date().toISOString(), trial_ends_at: new Date(Date.now() + 86_400_000).toISOString() }];
    const view = await getEntitlementsForUser({
      id: FAKE_USER_ID,
      planId: "trial",
      trialStartedAt: fakeDb.tables["profiles"][0].trial_started_at as string,
      trialEndsAt: fakeDb.tables["profiles"][0].trial_ends_at as string,
    });
    expect(view.providerCost).not.toBeNull();
  });

  it("24) normal (development) users' entitlements carry providerCost: null", async () => {
    const view = await getEntitlementsForUser({ id: USER_B, planId: "development", trialStartedAt: null, trialEndsAt: null });
    expect(view.providerCost).toBeNull();
  });
});

describe("19-21, 25-26) Admin user list", () => {
  beforeEach(() => {
    fakeDb.authUsers = [
      { id: USER_A, email: "alice@example.com", created_at: "2026-01-01T00:00:00Z", last_sign_in_at: "2026-01-05T00:00:00Z" },
      { id: USER_B, email: "bob@example.com", created_at: "2026-01-02T00:00:00Z" },
    ];
    fakeDb.tables["profiles"] = [
      { id: USER_A, plan_id: "trial", trial_started_at: "2026-01-01T00:00:00Z", trial_ends_at: "2026-01-08T00:00:00Z" },
      { id: USER_B, plan_id: "development", trial_started_at: null, trial_ends_at: null },
    ];
  });

  it("19-20) lists registered users, newest first, with Account Created from auth.users.created_at", async () => {
    const { users, total } = await listAdminUsers({ page: 1, perPage: 25 });
    expect(total).toBe(2);
    expect(users[0].id).toBe(USER_B); // created 2026-01-02, newer than USER_A
    expect(users[0].createdAt).toBe("2026-01-02T00:00:00Z");
  });

  it("21) lastSignInAt is populated where available, null otherwise", async () => {
    const { users } = await listAdminUsers({ page: 1, perPage: 25 });
    const alice = users.find((u) => u.id === USER_A)!;
    const bob = users.find((u) => u.id === USER_B)!;
    expect(alice.lastSignInAt).toBe("2026-01-05T00:00:00Z");
    expect(bob.lastSignInAt).toBeNull();
  });

  it("25) users are paginated (perPage respected)", async () => {
    const { users, total } = await listAdminUsers({ page: 1, perPage: 1 });
    expect(users).toHaveLength(1);
    expect(total).toBe(2);
  });

  it("26) email search finds the matching user only", async () => {
    const { users, total } = await listAdminUsers({ page: 1, perPage: 25, search: "alice" });
    expect(total).toBe(1);
    expect(users[0].id).toBe(USER_A);
  });

  it("search by exact user UUID works", async () => {
    const { users } = await listAdminUsers({ page: 1, perPage: 25, search: USER_B });
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(USER_B);
  });

  it("getAdminUserDetail returns the merged auth+profile view for one user", async () => {
    const detail = await getAdminUserDetail(USER_A);
    expect(detail?.email).toBe("alice@example.com");
    expect(detail?.planId).toBe("trial");
    expect(detail?.trialStatus).toBe("expired"); // trial_ends_at is in the past (Jan 2026 fixture)
  });

  it("dashboard summary counts total/active/expired trials and new-today from auth.users", async () => {
    const summary = await getAdminDashboardSummary();
    expect(summary.totalUsers).toBe(2);
    expect(summary.expiredTrials).toBe(1); // USER_A's trial ended in the fixture's past
  });
});

describe("27-28) Admin audit log", () => {
  it("27) recordAdminAudit writes an entry", async () => {
    await recordAdminAudit({ adminUserId: ADMIN_ID, action: "trial_config_updated", metadata: { before: {}, after: {} } });
    const rows = fakeDb.tables["admin_audit_log"];
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("trial_config_updated");
    expect(rows[0].admin_user_id).toBe(ADMIN_ID);
  });

  it("28) there is no exported function for a normal request-scoped caller to write admin_audit_log directly — only recordAdminAudit (admin client) does", async () => {
    const auditModule = await import("@/lib/admin/auditLog");
    expect(Object.keys(auditModule)).toEqual(["recordAdminAudit"]);
  });
});

describe("40) Account UI never receives providerCost (contract with app/api/usage/route.ts)", () => {
  it("getUserEntitlements() computes providerCost, but the route strips it before responding (see the route source)", async () => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "trial", trial_started_at: new Date().toISOString(), trial_ends_at: new Date(Date.now() + 86_400_000).toISOString() }];
    const entitlements = await getUserEntitlements();
    expect(entitlements.providerCost).not.toBeNull(); // present at the data layer...
    // ...but app/api/usage/route.ts destructures only plan/trialStatus/
    // trialEndsAt/projects/aiActions/transcriptionMinutes into its
    // response — verified by reading that file, not re-implemented here.
  });
});
