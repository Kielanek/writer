import { NextResponse } from "next/server";
import { ZodError } from "zod";

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
