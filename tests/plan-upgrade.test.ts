import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, FAKE_USER_ID } from "./fakeSupabase";

let currentUserId = FAKE_USER_ID;

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

function setCurrentUser(id: string) {
  currentUserId = id;
  fakeDb.currentUserId = id;
}

import { applyPlanChange } from "@/lib/entitlements/planChange";
import { POST as demoCheckout } from "@/app/api/upgrade/demo-checkout/route";

const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";

beforeEach(() => {
  Object.keys(fakeDb.tables).forEach((key) => delete fakeDb.tables[key]);
  setCurrentUser(FAKE_USER_ID);
});

describe("applyPlanChange (the shared activation boundary demo checkout AND a future Stripe webhook call)", () => {
  it("updates profiles.plan_id and stamps plan_changed_at", async () => {
    fakeDb.tables["profiles"] = [{ id: USER_A, plan_id: "starter", plan_changed_at: null }];

    await applyPlanChange({ userId: USER_A, fromPlan: "starter", toPlan: "pro", source: "demo_checkout" });

    const profile = fakeDb.tables["profiles"].find((p) => p.id === USER_A)!;
    expect(profile.plan_id).toBe("pro");
    expect(profile.plan_changed_at).not.toBeNull();
  });

  it("writes a plan_change_audit row recording from/to/source — never card data", async () => {
    fakeDb.tables["profiles"] = [{ id: USER_A, plan_id: "starter", plan_changed_at: null }];

    await applyPlanChange({ userId: USER_A, fromPlan: "starter", toPlan: "pro", source: "demo_checkout" });

    const rows = fakeDb.tables["plan_change_audit"];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: USER_A, from_plan: "starter", to_plan: "pro", source: "demo_checkout" });
    expect(JSON.stringify(rows[0])).not.toMatch(/4242|card|cvc/i);
  });
});

describe("POST /api/upgrade/demo-checkout (self-service demo upgrade)", () => {
  it("upgrades an authenticated Starter caller's OWN account to Pro and grants Pro entitlements immediately", async () => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "starter", plan_changed_at: null }];

    const res = await demoCheckout();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, plan: "pro" });

    const profile = fakeDb.tables["profiles"].find((p) => p.id === FAKE_USER_ID)!;
    expect(profile.plan_id).toBe("pro");

    const audit = fakeDb.tables["plan_change_audit"].find((r) => r.user_id === FAKE_USER_ID)!;
    expect(audit).toMatchObject({ from_plan: "starter", to_plan: "pro", source: "demo_checkout" });
  });

  it("rejects an already-Pro caller (only starter -> pro is allowed)", async () => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "pro", plan_changed_at: new Date().toISOString() }];

    const res = await demoCheckout();
    expect(res.status).toBe(400);

    const profile = fakeDb.tables["profiles"].find((p) => p.id === FAKE_USER_ID)!;
    expect(profile.plan_id).toBe("pro"); // unchanged
  });

  it("rejects a Development caller — there is no path from this endpoint to any plan but pro", async () => {
    fakeDb.tables["profiles"] = [{ id: FAKE_USER_ID, plan_id: "development", plan_changed_at: null }];

    const res = await demoCheckout();
    expect(res.status).toBe(400);
  });

  it("never accepts or reads a userId from the request — the acting user always comes from the session", async () => {
    // Structural: the route's own source never reads a body/userId at all —
    // it derives the actor exclusively from requireUser()/getUserProfile().
    const fs = await import("node:fs");
    const source = fs.readFileSync("app/api/upgrade/demo-checkout/route.ts", "utf-8");
    expect(source).not.toMatch(/NextRequest|request\.json\(/);
  });

  it("a user cannot upgrade another account — the route only ever touches the session's own profile row", async () => {
    fakeDb.tables["profiles"] = [
      { id: USER_A, plan_id: "starter", plan_changed_at: null },
      { id: USER_B, plan_id: "starter", plan_changed_at: null },
    ];
    setCurrentUser(USER_A);

    await demoCheckout();

    const a = fakeDb.tables["profiles"].find((p) => p.id === USER_A)!;
    const b = fakeDb.tables["profiles"].find((p) => p.id === USER_B)!;
    expect(a.plan_id).toBe("pro");
    expect(b.plan_id).toBe("starter"); // untouched
  });

  it("rejects an unauthenticated caller", async () => {
    setCurrentUser("");
    const res = await demoCheckout();
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("No real or fake card data is ever collected or stored (structural)", () => {
  it("the demo-checkout route source contains no card-number/CVC field names", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync("app/api/upgrade/demo-checkout/route.ts", "utf-8");
    expect(source).not.toMatch(/cardNumber|cvc|expiry/i);
  });

  it("the demo checkout dialog never renders an editable card input — only a fixed label", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync("components/upgrade/demo-checkout-dialog.tsx", "utf-8");
    expect(source).not.toMatch(/<input/i);
    expect(source).toContain("4242");
  });
});
