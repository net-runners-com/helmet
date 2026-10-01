// Type definitions for @helmet/core.

export interface FontFaceSpec {
  /** Source font file (TTF/OTF), relative to the project's font source dir. */
  file: string;
  /** CSS font-family the site uses for this face. */
  family: string;
  weight?: string;
  style?: "normal" | "italic";
}

export interface HelmetConfig {
  /** Seconds a session may fetch protected assets before its signature expires. */
  assetTtl: number;
  /** URL prefix for signed, masked assets (frames, fonts, data). */
  protectedPrefix: string;
  turnstile: { sitekeyVar: string; secretVar: string; sitekeyPlaceholder: string };
  signingSecretVar: string;
  obfuscate: {
    enabled: boolean;
    /** Explicit names; omit to auto-extract from source. */
    classes?: string[];
    ids?: string[];
    keep: string[];
    /** Rotates every token; set per deploy to break cached scrapers. */
    salt: string;
    prefix: string;
    /** `true` for defaults, or javascript-obfuscator options. */
    js: boolean | Record<string, unknown>;
  };
  fonts: {
    variants: number;
    homophones: number;
    faces?: Record<string, FontFaceSpec>;
  };
  watermark: { text: string; quality: number };
  frames: { pack: number };
  noise: { enabled: boolean; canaryPrefix: string; decoyMin: number; decoyMax: number };
  forensic: { enabled: boolean };
  deterrents: { devtools: boolean; contextMenu: boolean; shortcuts: boolean };
}

export function defineConfig(config?: Partial<HelmetConfig>): HelmetConfig;

export const DEFAULTS: HelmetConfig;
export const BLOCKED_UA: RegExp;
export const POLICY_PATHS: string[];
export const DEFAULT_KEEP: string[];
export const DENY_NOTICE: string;
export function securityHeaders(opts?: { scriptExtra?: string[]; frameExtra?: string[] }): Record<string, string>;

export interface Obfuscator {
  MAP: Record<string, string>;
  ID_MAP: Record<string, string>;
  rewriteCss(code: string): string;
  rewriteJs(code: string): string;
  rewriteHtml(html: string): string;
}
export function createObfuscator(opts: {
  classes: string[];
  ids?: string[];
  keep?: string[];
  salt?: string;
  prefix?: string;
}): Obfuscator;
export function extractNames(sources: string[]): { classes: string[]; ids: string[] };

export function b64e(buf: ArrayBuffer | Uint8Array): string;
export function b64u(buf: ArrayBuffer | Uint8Array): string;
export function b64d(s: string): Uint8Array;
export function hmac(secret: string, msg: string): Promise<ArrayBuffer>;
export function serverHandshake(clientPubRaw: Uint8Array): Promise<{ aes: CryptoKey; serverPubRaw: Uint8Array }>;
export function clientHandshake(): Promise<{ pubRaw: Uint8Array; finish(serverPubRaw: Uint8Array): Promise<CryptoKey> }>;
export function encryptJSON(aes: CryptoKey, obj: unknown): Promise<{ iv: Uint8Array; ct: Uint8Array }>;
export function decryptJSON(aes: CryptoKey, iv: Uint8Array, ct: Uint8Array): Promise<unknown>;
export function xorMask(data: Uint8Array, key: Uint8Array): Uint8Array;
export function randomU32(): number;

export function extractCssNames(css: string): { classes: string[]; ids: string[] };

export function embedTextCanary(text: string, sid: number): string;
export function extractTextCanary(text: string): number | null;
export function stripCanary(text: string): string;
