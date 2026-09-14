import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, FAKE_USER_ID } from "./fakeSupabase";

vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => ({ id: FAKE_USER_ID }),
  getAuthedUser: async () => ({ id: FAKE_USER_ID }),
}));

// recordUsageEvent uses the admin client (never the session client) since
// authenticated users have no INSERT grant on usage_events at all — routed
// through the same fake table store so tests can assert on what got written.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeDb,
}));

import { getUserPlan } from "@/lib/entitlements/profile";
import {
  checkAiActionLimit,
  checkTranscriptionAllowance,
  getUserEntitlements,
  recordUsageEvent,
} from "@/lib/entitlements/usage";
import { UsageLimitError } from "@/lib/entitlements/errors";
import { getCurrentUsagePeriod } from "@/lib/entitlements/period";
import { PLAN_LIMITS } from "@/lib/entitlements/plans";
import { createProject } from "@/lib/db/projects";

beforeEach(() => {
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
  fakeDb.currentUserId = FAKE_USER_ID;
});

describe("getUserPlan", () => {
  it("defaults a user with no profiles row to the development plan", async () => {
    expect(await getUserPlan()).toBe("development");
  });

  it("reads an explicit plan from the profiles row when one exists", async () => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "pro" }];
    expect(await getUserPlan()).toBe("pro");
  });
});

describe("getCurrentUsagePeriod", () => {
  it("is the current UTC calendar month, start inclusive and end exclusive", () => {
    const { start, end } = getCurrentUsagePeriod(new Date("2026-03-15T12:00:00Z"));
    expect(start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("rolls over correctly across a year boundary", () => {
    const { start, end } = getCurrentUsagePeriod(new Date("2026-12-25T00:00:00Z"));
    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("recordUsageEvent + getUserEntitlements", () => {
  it("an ai_action recorded this month is reflected in entitlements usage", async () => {
    await recordUsageEvent({
      eventType: "ai_action",
      quantity: 1,
      metadata: { feature: "test" },
      billingUserId: FAKE_USER_ID,
    });
    await recordUsageEvent({ eventType: "ai_action", quantity: 1, billingUserId: FAKE_USER_ID });

    const entitlements = await getUserEntitlements();
    expect(entitlements.aiActions.used).toBe(2);
    expect(entitlements.aiActions.limit).toBe(PLAN_LIMITS.development.aiActionsLimit);
    expect(entitlements.aiActions.remaining).toBe(PLAN_LIMITS.development.aiActionsLimit - 2);
  });

  it("transcription usage is tracked in seconds internally, minutes in entitlements", async () => {
    await recordUsageEvent({ eventType: "transcription_seconds", quantity: 90, billingUserId: FAKE_USER_ID });

    const entitlements = await getUserEntitlements();
    expect(entitlements.transcriptionMinutes.used).toBe(1.5);
  });

  it("a usage event from a prior month is excluded from the current period", async () => {
    fakeDb.tables["usage_events"] = [
      {
        id: "old",
        user_id: FAKE_USER_ID,
        event_type: "ai_action",
        quantity: 5,
        created_at: "2020-01-01T00:00:00.000Z",
      },
    ];

    const entitlements = await getUserEntitlements();
    expect(entitlements.aiActions.used).toBe(0);
  });

  it("project count in entitlements reflects only this user's projects", async () => {
    fakeDb.tables["projects"] = [
      { id: "p1", user_id: FAKE_USER_ID, owner_id: FAKE_USER_ID, name: "Mine", created_at: "", updated_at: "" },
      { id: "p2", user_id: "someone-else", owner_id: "someone-else", name: "Not mine", created_at: "", updated_at: "" },
    ];

    const entitlements = await getUserEntitlements();
    expect(entitlements.projects.used).toBe(1);
    expect(entitlements.projects.remaining).toBe(PLAN_LIMITS.development.maxProjects - 1);
  });
});

describe("checkAiActionLimit", () => {
  it("does not throw when usage is below the plan limit", async () => {
    await expect(checkAiActionLimit(FAKE_USER_ID)).resolves.toBeUndefined();
  });

  it("throws UsageLimitError once usage reaches the plan limit", async () => {
    const limit = PLAN_LIMITS.development.aiActionsLimit;
    fakeDb.tables["usage_events"] = [
      { id: "e1", user_id: FAKE_USER_ID, event_type: "ai_action", quantity: limit, created_at: new Date().toISOString() },
    ];

    await expect(checkAiActionLimit(FAKE_USER_ID)).rejects.toBeInstanceOf(UsageLimitError);
  });
});

describe("checkTranscriptionAllowance", () => {
  it("throws UsageLimitError once usage reaches the plan's minute limit", async () => {
    const limitSeconds = PLAN_LIMITS.development.transcriptionMinutesLimit * 60;
    fakeDb.tables["usage_events"] = [
      {
        id: "e1",
        user_id: FAKE_USER_ID,
        event_type: "transcription_seconds",
        quantity: limitSeconds,
        created_at: new Date().toISOString(),
      },
    ];

    await expect(checkTranscriptionAllowance(FAKE_USER_ID)).rejects.toBeInstanceOf(UsageLimitError);
  });
});

describe("Project limit enforcement (create_project_with_limit)", () => {
  it("allows creation below the limit", async () => {
    const project = await createProject({ name: "Under the limit", description: null });
    expect(project.user_id).toBe(FAKE_USER_ID);
  });

  it("blocks creation once the user already owns maxProjects", async () => {
    const limit = PLAN_LIMITS.development.maxProjects;
    fakeDb.tables["projects"] = Array.from({ length: limit }, (_, i) => ({
      id: `p${i}`,
      user_id: FAKE_USER_ID,
      owner_id: FAKE_USER_ID,
      name: `Project ${i}`,
      created_at: "",
      updated_at: "",
    }));

    await expect(createProject({ name: "One too many", description: null })).rejects.toBeInstanceOf(
      UsageLimitError
    );
  });
});
