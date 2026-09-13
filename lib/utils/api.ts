import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UsageLimitError } from "@/lib/entitlements/errors";
import { TrialBudgetExhaustedError } from "@/lib/entitlements/reservation";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Wraps a route handler so unexpected errors never leave the client hanging. */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof TrialBudgetExhaustedError) {
        // Deliberately minimal — see lib/entitlements/reservation.ts: this
        // must never carry a used/limit in USD, unlike UsageLimitError's
        // shape below, because the whole point is that real provider
        // economics never reach the client.
        return NextResponse.json({ error: "trial_budget_exhausted" }, { status: 429 });
      }
      if (err instanceof UsageLimitError) {
        // The one place this shape is produced — every route that can hit a
        // usage limit returns the exact same structured body (see spec
        // section 17), never a route-specific message.
        return NextResponse.json(
          {
            error: "usage_limit_reached",
            resource: err.resource,
            used: err.used,
            limit: err.limit,
            resetsAt: err.resetsAt,
          },
          { status: 429 }
        );
      }
      if (err instanceof ApiError) {
        return jsonError(err.status, err.message);
      }
      if (err instanceof ZodError) {
        const message = err.issues.map((i) => i.message).join(", ");
        return jsonError(400, message || "Invalid request");
      }
      console.error(err);
      return jsonError(500, "Something went wrong. Please try again.");
    }
  };
}
