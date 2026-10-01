import { NextResponse } from "next/server";
import { reportApiError } from "../report-error";
import type { AccessError } from "../auth";

export const json = (body: unknown, status = 200, headers?: Record<string, string>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

export const accessFail = (a: AccessError) => fail(a.error, a.status);

/** Thrown inside services/transactions to produce a specific HTTP error. */
export class HttpError extends Error {
  constructor(public status: number, public code: string, public extra: Record<string, unknown> = {}) {
    super(code);
  }
}

/** Run a handler body; HttpError → its status, anything else → reported 500. */
export async function handle(where: string, ctx: { slug?: string; uid?: string }, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) return fail(err.code, err.status, err.extra);
    // A transaction that lost to a concurrent one (retries exhausted / aborted) has
    // committed nothing; tell the client to reload and try again.
    const e = err as { code?: unknown; message?: unknown };
    if (e?.code === 10 || (e?.code === 3 && String(e.message).includes("Transaction is invalid or closed"))) {
      return fail("concurrent_request", 409);
    }
    await reportApiError(where, err, ctx);
    return fail("server_error", 500);
  }
}
