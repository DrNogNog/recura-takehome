import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Wraps async handlers so rejected promises reach the Express error handler. */
export const handle =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Read-heavy endpoints (patients refresh status many times) send a strong ETag and
 * a Last-Modified header so repeat polls get a cheap 304 instead of a full body.
 */
export function sendCached(
  req: Request,
  res: Response,
  body: unknown,
  opts: { lastUpdated?: string; cacheControl: string }
) {
  const json = JSON.stringify(body);
  const etag = `"${createHash("sha1").update(json).digest("base64url")}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", opts.cacheControl);
  if (opts.lastUpdated) res.setHeader("Last-Modified", new Date(opts.lastUpdated).toUTCString());
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  res.type("application/json").send(json);
}
