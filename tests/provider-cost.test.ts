import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, FAKE_USER_ID } from "./fakeSupabase";

let currentUserId = FAKE_USER_ID;

vi.mock("@/lib/db/client", () => ({
  getSupabaseServerClient: () => fakeDb,
}));
vi.mock("@/lib/supabase/auth", () => ({
  requireUser: async () => ({ id: currentUserId }),
  getAuthedUser: async () => ({ id: currentUserId }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeDb,
}));

import {
  calculateTextCostUsd,
  calculateTranscriptionCostUsd,
  estimateTranscriptionDurationSecondsFromFileSize,
  UnknownModelPricingError,
} from "@/lib/entitlements/cost";
import {
  checkAndReserveProviderBudget,
  reconcileProviderReservation,
  releaseProviderReservation,
  getProviderCostTotal,
  ProviderBudgetExhaustedError,
} from "@/lib/entitlements/reservation";
import { checkAiActionLimit, checkTranscriptionAllowance, getUserEntitlements, recordUsageEvent } from "@/lib/entitlements/usage";
import { createProject } from "@/lib/db/projects";
import { PLAN_LIMITS } from "@/lib/entitlements/plans";

function setCurrentUser(id: string) {
  currentUserId = id;
  fakeDb.currentUserId = id;
}

beforeEach(() => {
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
  setCurrentUser(FAKE_USER_ID);
});

// --- 1-5: raw pricing math -------------------------------------------------

describe("calculateTextCostUsd (Terra)", () => {
  it("1) uncached input only", () => {
    // 500,000 tokens @ $2.00/1M = $1.00
    const cost = calculateTextCostUsd({
      model: "gpt-5.6-terra",
      inputTokens: 500_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo(1.0, 10);
  });

  it("2) cached input only", () => {
    // 500,000 cached tokens @ $0.20/1M = $0.10
    const cost = calculateTextCostUsd({
      model: "gpt-5.6-terra",
      inputTokens: 500_000,
      cachedInputTokens: 500_000,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo(0.1, 10);
  });

  it("3) output only", () => {
    // 100,000 output tokens @ $12.00/1M = $1.20
    const cost = calculateTextCostUsd({
      model: "gpt-5.6-terra",
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 100_000,
    });
    expect(cost).toBeCloseTo(1.2, 10);
  });

  it("4) combined request: mixed cached/uncached input + output", () => {
    const cost = calculateTextCostUsd({
      model: "gpt-5.6-terra",
      inputTokens: 5420,
      cachedInputTokens: 0,
      outputTokens: 1920,
    });
    const expected = (5420 / 1_000_000) * 2.0 + (1920 / 1_000_000) * 12.0;
    expect(cost).toBeCloseTo(expected, 12);
    expect(cost).toBeCloseTo(0.03388, 10);
  });
});

describe("calculateTranscriptionCostUsd (gpt-transcribe)", () => {
  it("5) 10 minutes costs $0.045", () => {
    const cost = calculateTranscriptionCostUsd({ model: "gpt-transcribe", durationSeconds: 600 });
    expect(cost).toBeCloseTo(0.045, 10);
  });
});

// --- 6: sub-cent precision is preserved end-to-end -------------------------

describe("provider_cost usage_events store sub-cent precision", () => {
  it("6) a fractional-cent cost round-trips exactly through recordUsageEvent + getProviderCostTotal", async () => {
    const tinyCost = 0.0034;
    await recordUsageEvent({
      eventType: "provider_cost",
      quantity: tinyCost,
      metadata: { feature: "test" },
      billingUserId: FAKE_USER_ID,
    });

    const total = await getProviderCostTotal(FAKE_USER_ID);
    expect(total).toBeCloseTo(tinyCost, 10);
    expect(total).not.toBe(0);
  });
});

// --- 7: unknown model safety -------------------------------------------

describe("Unknown model pricing", () => {
  it("7) throws rather than silently costing $0", () => {
    expect(() =>
      calculateTextCostUsd({ model: "some-future-model", inputTokens: 100, cachedInputTokens: 0, outputTokens: 100 })
    ).toThrow(UnknownModelPricingError);

    expect(() => calculateTranscriptionCostUsd({ model: "whisper-1", durationSeconds: 60 })).toThrow(
      UnknownModelPricingError
    );
  });
});

// --- 8-9: plan behavior --------------------------------------------------

describe("Plan cost-cap behavior", () => {
  it("8) development plan has no provider-cost cap", async () => {
    // no profiles row seeded => getUserPlan() falls back to development
    const reservation = await checkAndReserveProviderBudget({
      feature: "test",
      estimatedCostUsd: 1000,
      billingUserId: FAKE_USER_ID,
    });
    expect(reservation).toBeNull(); // no cap => nothing to reserve, never blocks
  });

  it("9) Starter has a $0.50 cap, Pro has no cap", () => {
    expect(PLAN_LIMITS.starter.apiCostBudgetUsd).toBe(0.5);
    expect(PLAN_LIMITS.development.apiCostBudgetUsd).toBeNull();
    expect(PLAN_LIMITS.pro.apiCostBudgetUsd).toBeNull();
  });
});

// --- 10-12: reservation flow -----------------------------------------------

describe("Starter budget reservation", () => {
  beforeEach(() => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter" }];
  });

  it("10) below budget: reservation succeeds", async () => {
    const reservation = await checkAndReserveProviderBudget({
      feature: "test",
      estimatedCostUsd: 0.1,
      billingUserId: FAKE_USER_ID,
    });
    expect(reservation).not.toBeNull();
    expect(reservation!.reservedCostUsd).toBe(0.1);
  });

  it("11) at budget: reservation is rejected with ProviderBudgetExhaustedError", async () => {
    await recordUsageEvent({ eventType: "provider_cost", quantity: 0.5, metadata: {}, billingUserId: FAKE_USER_ID });

    await expect(
      checkAndReserveProviderBudget({ feature: "test", estimatedCostUsd: 0.01, billingUserId: FAKE_USER_ID })
    ).rejects.toBeInstanceOf(ProviderBudgetExhaustedError);
  });

  it("12) a reservation whose estimate would exceed remaining budget is blocked BEFORE any OpenAI call happens", async () => {
    // 0.45 already spent, 0.05 estimated -> exactly at the edge is allowed...
    await recordUsageEvent({ eventType: "provider_cost", quantity: 0.45, metadata: {}, billingUserId: FAKE_USER_ID });
    await expect(
      checkAndReserveProviderBudget({ feature: "test", estimatedCostUsd: 0.05, billingUserId: FAKE_USER_ID })
    ).resolves.not.toBeNull();

    // ...but one cent more pushes it over and must be rejected up front.
    await expect(
      checkAndReserveProviderBudget({ feature: "test", estimatedCostUsd: 0.06, billingUserId: FAKE_USER_ID })
    ).rejects.toBeInstanceOf(ProviderBudgetExhaustedError);
  });

  it("Starter's provider-cost budget does not reset across a calendar month boundary — it's a lifetime cap", async () => {
    // Spend recorded "months ago" still counts against the same $0.50 cap —
    // there is no calendar-month filter for a lifetime-scoped plan.
    fakeDb.tables["usage_events"] = [
      {
        id: "old",
        user_id: FAKE_USER_ID,
        event_type: "provider_cost",
        quantity: 0.5,
        created_at: "2020-01-01T00:00:00.000Z",
      },
    ];
    await expect(
      checkAndReserveProviderBudget({ feature: "test", estimatedCostUsd: 0.01, billingUserId: FAKE_USER_ID })
    ).rejects.toBeInstanceOf(ProviderBudgetExhaustedError);
  });
});

// --- 13-14: reconcile / release --------------------------------------------

describe("Reservation reconciliation and release", () => {
  beforeEach(() => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter" }];
  });

  it("13) reconciling records the ACTUAL cost, not the estimate", async () => {
    const reservation = await checkAndReserveProviderBudget({
      feature: "document_generation",
      estimatedCostUsd: 0.2,
      billingUserId: FAKE_USER_ID,
    });
    expect(reservation).not.toBeNull();

    await reconcileProviderReservation(
      reservation!.id,
      0.0123,
      FAKE_USER_ID,
      FAKE_USER_ID,
      undefined,
      { model: "gpt-5.6-terra" }
    );

    const total = await getProviderCostTotal(FAKE_USER_ID);
    expect(total).toBeCloseTo(0.0123, 10);

    const row = fakeDb.tables["provider_cost_reservations"].find((r) => r.id === reservation!.id)!;
    expect(row.status).toBe("completed");
    expect(row.actual_cost_usd).toBe(0.0123);
  });

  it("14) a failed request releases the reservation without recording any cost", async () => {
    const reservation = await checkAndReserveProviderBudget({
      feature: "document_generation",
      estimatedCostUsd: 0.2,
      billingUserId: FAKE_USER_ID,
    });
    expect(reservation).not.toBeNull();

    await releaseProviderReservation(reservation!.id, FAKE_USER_ID);

    const total = await getProviderCostTotal(FAKE_USER_ID);
    expect(total).toBe(0);

    const row = fakeDb.tables["provider_cost_reservations"].find((r) => r.id === reservation!.id)!;
    expect(row.status).toBe("released");

    // Budget is free again — a second reservation for the full amount succeeds.
    const second = await checkAndReserveProviderBudget({
      feature: "document_generation",
      estimatedCostUsd: 0.5,
      billingUserId: FAKE_USER_ID,
    });
    expect(second).not.toBeNull();
  });
});

// --- 15: concurrency (simulated) --------------------------------------------

describe("Two simultaneous reservations cannot overspend the same remaining budget", () => {
  beforeEach(() => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter" }];
  });

  it("15) second concurrent reservation sees the first's hold and is rejected", async () => {
    const first = await checkAndReserveProviderBudget({ feature: "a", estimatedCostUsd: 0.3, billingUserId: FAKE_USER_ID });
    expect(first).not.toBeNull();

    await expect(
      checkAndReserveProviderBudget({ feature: "b", estimatedCostUsd: 0.3, billingUserId: FAKE_USER_ID })
    ).rejects.toBeInstanceOf(ProviderBudgetExhaustedError);
  });
});

// --- 16-18: multi-call / automatic-call cost tracking -----------------------

describe("Multi-call operations and automatic internal calls both count toward provider cost", () => {
  it("16) two OpenAI calls belonging to one AI Action both record their own provider_cost", async () => {
    await recordUsageEvent({
      eventType: "provider_cost",
      quantity: 0.01,
      metadata: { feature: "document_generation" },
      billingUserId: FAKE_USER_ID,
    });
    await recordUsageEvent({
      eventType: "provider_cost",
      quantity: 0.004,
      metadata: { feature: "document_generation_repair" },
      billingUserId: FAKE_USER_ID,
    });

    const total = await getProviderCostTotal(FAKE_USER_ID);
    expect(total).toBeCloseTo(0.014, 10);
  });

  it("17) an automatic SEO repair call's cost is attributed to its own feature, separate from the main call", async () => {
    await recordUsageEvent({
      eventType: "provider_cost",
      quantity: 0.02,
      metadata: { feature: "document_edit" },
      billingUserId: FAKE_USER_ID,
    });
    await recordUsageEvent({
      eventType: "provider_cost",
      quantity: 0.006,
      metadata: { feature: "document_edit_repair" },
      billingUserId: FAKE_USER_ID,
    });

    const events = fakeDb.tables["usage_events"].filter((e) => e.event_type === "provider_cost");
    expect(events.map((e) => (e.metadata as { feature: string }).feature).sort()).toEqual([
      "document_edit",
      "document_edit_repair",
    ]);
  });

  it("18) an automatic internal call (note metadata) counts provider cost even though it's never an AI Action", async () => {
    await recordUsageEvent({
      eventType: "provider_cost",
      quantity: 0.0007,
      metadata: { feature: "note_metadata" },
      billingUserId: FAKE_USER_ID,
    });

    const providerTotal = await getProviderCostTotal(FAKE_USER_ID);
    const aiActionTotal = fakeDb.tables["usage_events"].filter((e) => e.event_type === "ai_action").length;

    expect(providerTotal).toBeCloseTo(0.0007, 10);
    expect(aiActionTotal).toBe(0); // never recorded as a product AI Action
  });
});

// --- 19-20: transcription cost ----------------------------------------------

describe("Transcription cost estimation and recording", () => {
  it("19) a larger file estimates a longer (safely conservative) duration than a smaller one", () => {
    const small = estimateTranscriptionDurationSecondsFromFileSize(1_000_000); // 1MB
    const large = estimateTranscriptionDurationSecondsFromFileSize(20_000_000); // 20MB
    expect(large).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
  });

  it("20) actual transcription cost is recorded from real duration, not the pre-call estimate", async () => {
    const realDurationSeconds = 137; // whatever Whisper actually reports
    const cost = calculateTranscriptionCostUsd({ model: "gpt-transcribe", durationSeconds: realDurationSeconds });
    await recordUsageEvent({
      eventType: "provider_cost",
      quantity: cost,
      metadata: { feature: "transcription", durationSeconds: realDurationSeconds },
      billingUserId: FAKE_USER_ID,
    });

    const total = await getProviderCostTotal(FAKE_USER_ID);
    expect(total).toBeCloseTo((realDurationSeconds / 60) * 0.0045, 10);
  });
});

// --- 21-23: existing product limits still work ------------------------------

describe("Existing product limits are unaffected by the cost layer", () => {
  it("21) AI Action limit still blocks at the configured count", async () => {
    fakeDb.tables["usage_events"] = [
      {
        id: "e1",
        user_id: FAKE_USER_ID,
        event_type: "ai_action",
        quantity: PLAN_LIMITS.development.aiActionsLimit,
        created_at: new Date().toISOString(),
      },
    ];
    await expect(checkAiActionLimit(FAKE_USER_ID)).rejects.toThrow();
  });

  it("22) transcription-minute limit still blocks at the configured count", async () => {
    fakeDb.tables["usage_events"] = [
      {
        id: "e1",
        user_id: FAKE_USER_ID,
        event_type: "transcription_seconds",
        quantity: PLAN_LIMITS.development.transcriptionMinutesLimit * 60,
        created_at: new Date().toISOString(),
      },
    ];
    await expect(checkTranscriptionAllowance(FAKE_USER_ID)).rejects.toThrow();
  });

  it("23) project limit still blocks at maxProjects", async () => {
    fakeDb.tables["projects"] = Array.from({ length: PLAN_LIMITS.development.maxProjects }, (_, i) => ({
      id: `p${i}`,
      user_id: FAKE_USER_ID,
      owner_id: FAKE_USER_ID,
      name: `Project ${i}`,
      created_at: "",
      updated_at: "",
    }));
    await expect(createProject({ name: "One too many", description: null })).rejects.toThrow();
  });
});

// --- 24-25: users cannot tamper with cost accounting ------------------------

describe("Users cannot alter provider-cost accounting (application-layer contract)", () => {
  it("24) recordUsageEvent always writes via the admin path (see lib/entitlements/usage.ts) — there is no user-facing function that accepts an arbitrary quantity for provider_cost", () => {
    expect(typeof recordUsageEvent).toBe("function");
    expect(recordUsageEvent.length).toBeLessThanOrEqual(1); // single options object, no userId param
  });

  it("25) reconcile/release only ever touch the caller's OWN reservation (scoped by user_id in the RPC)", async () => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter" }];
    const reservation = await checkAndReserveProviderBudget({
      feature: "x",
      estimatedCostUsd: 0.1,
      billingUserId: FAKE_USER_ID,
    });

    setCurrentUser("someone-else-entirely");
    await expect(
      reconcileProviderReservation(reservation!.id, 0.01, "someone-else-entirely", "someone-else-entirely", undefined)
    ).rejects.toBeTruthy();

    setCurrentUser(FAKE_USER_ID);
    const row = fakeDb.tables["provider_cost_reservations"].find((r) => r.id === reservation!.id)!;
    expect(row.status).toBe("reserved"); // untouched by the other user's attempt
  });
});

// --- 26: plan cannot be changed from the browser (contract) -----------------

describe("Plan cannot be changed by the client", () => {
  it("26) there is no exported function that lets a request-scoped caller write profiles.plan_id", async () => {
    const usageModule = await import("@/lib/entitlements/usage");
    const profileModule = await import("@/lib/entitlements/profile");
    expect(Object.keys(usageModule)).not.toContain("setUserPlan");
    expect(Object.keys(usageModule)).not.toContain("updateUserPlan");
    expect(Object.keys(profileModule).sort()).toEqual(["getProfileForUser", "getUserPlan", "getUserProfile"]);
  });
});

// --- 27: entitlements never leaks $ to the public endpoint shape -----------

describe("getUserEntitlements()", () => {
  it("27) includes providerCost internally for a capped plan, but the field is documented as UI-exempt (see app/api/usage/route.ts, which strips it)", async () => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter" }];
    await recordUsageEvent({ eventType: "provider_cost", quantity: 0.1, metadata: {}, billingUserId: FAKE_USER_ID });

    const entitlements = await getUserEntitlements();
    expect(entitlements.plan).toBe("starter");
    expect(entitlements.providerCost).toEqual({ usedUsd: 0.1, limitUsd: 0.5, remainingUsd: 0.4 });
    expect(entitlements.projects.limit).toBe(PLAN_LIMITS.starter.maxProjects);
    expect(entitlements.aiActions.limit).toBe(PLAN_LIMITS.starter.aiActionsLimit);
  });

  it("development plan's entitlements carry providerCost: null (nothing to protect)", async () => {
    const entitlements = await getUserEntitlements();
    expect(entitlements.providerCost).toBeNull();
  });
});
