import type { HelmetConfig } from "@helmet/core";

export interface SessionCtx {
  /** The decoy-font variant chosen for this session. */
  variant: string;
  /** Raw char → fake-codepoint homophone map for this variant. */
  map: Record<string, string[]>;
  /** Encode a string into this session's decoy codepoints. */
  encode(s: string): string;
  /** Embed this session's id as invisible canary marks, then decoy-encode. */
  canary(s: string): string;
  /** Unix expiry for the session's protected-asset signature. */
  exp: number;
  /** Query string (`e=…&s=…`) appended to protected-asset URLs. */
  q: string;
  /** Base64 XOR mask key for unmasking protected assets client-side. */
  k: string;
  /** Per-session id, logged server-side; embed for screenshot forensics. */
  sid: number;
  prefix: string;
  ttl: number;
}

export interface CreateHelmetOptions {
  config: HelmetConfig;
  /** Decoy-font maps: { [variant]: { [realChar]: fakeChar[] } }. */
  maps?: Record<string, Record<string, string[]>>;
  /** Paths the worker may serve as plain static files (everything else → 404). */
  publicFiles?: string[];
  /** Build the plaintext payload encrypted for one visitor. */
  session(ctx: SessionCtx): unknown | Promise<unknown>;
  blockedUserAgents?: RegExp;
}

export interface HelmetEnv {
  ASSETS: { fetch(req: Request): Promise<Response> };
  [key: string]: unknown;
}

export function createHelmet(opts: CreateHelmetOptions): {
  fetch(req: Request, env: HelmetEnv): Promise<Response>;
};
