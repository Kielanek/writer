import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanId } from "@/lib/entitlements/plans";
import { getTrialStatus, type TrialStatus } from "@/lib/entitlements/trial";

export interface AdminUserSummary {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  planId: PlanId;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialStatus: TrialStatus;
}

/**
 * Safety cap on how many auth.users this module will ever scan in one
 * admin request. The GoTrue Admin API has no server-side search/sort, so
 * "newest first" + "search by email" are done in memory after fetching —
 * fine at this product's current (and foreseeable near-term) user count,
 * but deliberately bounded rather than truly unlimited. If this cap is
 * ever hit in practice, replace with a proper indexed query.
 */
const MAX_USERS_SCANNED = 5000;
const GOTRUE_PAGE_SIZE = 1000;

interface RawAuthUser {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string;
}

async function fetchAllAuthUsers(): Promise<RawAuthUser[]> {
  const admin = createAdminClient();
  const all: RawAuthUser[] = [];
  let page = 1;

  while (all.length < MAX_USERS_SCANNED) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: GOTRUE_PAGE_SIZE });
    if (error) throw error;
    all.push(...data.users);
    if (!data.nextPage || data.users.length === 0) break;
    page = data.nextPage;
  }

  return all;
}

interface ProfileRow {
  id: string;
  plan_id: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
}

function toSummary(user: RawAuthUser, profile: ProfileRow | undefined): AdminUserSummary {
  const planId = (profile?.plan_id as PlanId) ?? "development";
  const trialEndsAt = profile?.trial_ends_at ?? null;
  return {
    id: user.id,
    email: user.email ?? null,
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
    planId,
    trialStartedAt: profile?.trial_started_at ?? null,
    trialEndsAt,
    trialStatus: getTrialStatus({ planId, trialEndsAt }),
  };
}

/**
 * Paginated, searchable user list for the Admin Panel. NEVER exposes
 * anything beyond id/email/timestamps/plan — never Note/Document content
 * (see the product spec: this panel is for account/plan/usage oversight,
 * not reading user content).
 */
export async function listAdminUsers(input: {
  page: number;
  perPage: number;
  search?: string;
}): Promise<{ users: AdminUserSummary[]; total: number }> {
  const admin = createAdminClient();
  const authUsers = await fetchAllAuthUsers();

  const search = input.search?.trim().toLowerCase();
  const filtered = search
    ? authUsers.filter((u) => u.id.toLowerCase() === search || (u.email ?? "").toLowerCase().includes(search))
    : authUsers;

  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = filtered.length;
  const start = (input.page - 1) * input.perPage;
  const pageUsers = filtered.slice(start, start + input.perPage);

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, plan_id, trial_started_at, trial_ends_at")
    .in("id", pageUsers.map((u) => u.id));
  if (error) throw error;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p as ProfileRow]));
  const users = pageUsers.map((u) => toSummary(u, profileById.get(u.id)));

  return { users, total };
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserSummary | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return null;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, plan_id, trial_started_at, trial_ends_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;

  return toSummary(data.user, (profile as ProfileRow | null) ?? undefined);
}

/** Counts only — never content. See lib/admin/users.ts's module doc / the product spec's privacy section. */
export async function getAdminUserContentCounts(
  userId: string
): Promise<{ projects: number; documents: number }> {
  const admin = createAdminClient();
  const [projects, documents] = await Promise.all([
    admin.from("projects").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("documents").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if (projects.error) throw projects.error;
  if (documents.error) throw documents.error;
  return { projects: projects.count ?? 0, documents: documents.count ?? 0 };
}

export interface AdminDashboardSummary {
  totalUsers: number;
  activeTrials: number;
  expiredTrials: number;
  newUsersToday: number;
}

export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  const admin = createAdminClient();
  const [authUsers, { data: profiles, error }] = await Promise.all([
    fetchAllAuthUsers(),
    admin.from("profiles").select("plan_id, trial_ends_at"),
  ]);
  if (error) throw error;

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const newUsersToday = authUsers.filter((u) => new Date(u.created_at) >= todayStart).length;

  let activeTrials = 0;
  let expiredTrials = 0;
  for (const p of profiles ?? []) {
    if (p.plan_id !== "trial") continue;
    const status = getTrialStatus({ planId: p.plan_id, trialEndsAt: p.trial_ends_at });
    if (status === "trialing") activeTrials++;
    else if (status === "expired") expiredTrials++;
  }

  return { totalUsers: authUsers.length, activeTrials, expiredTrials, newUsersToday };
}
