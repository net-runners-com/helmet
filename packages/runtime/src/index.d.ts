export interface FontFaceRuntime {
  family: string;
  weight?: string;
  style?: "normal" | "italic";
}

export interface HelmetSession {
  /** Copy for a data-t key, encoded for this session's decoy fonts. */
  T(key: string): string;
  /** Fill every [data-t] under root with its (encoded) copy. */
  fill(root?: ParentNode): void;
  /** Fetch and unmask a protected asset's bytes. */
  asset(path: string): Promise<Uint8Array>;
  /** Fetch, unmask and JSON-parse a protected asset. */
  json(path: string): Promise<unknown>;
  /** The full decrypted payload (project-specific fields included). */
  doc: Record<string, unknown>;
}

export interface HelmetRuntimeOptions {
  /** Index-aligned with the server payload's font paths. */
  fontFaces?: FontFaceRuntime[];
  sessionUrl?: string;
  turnstileCallback?: string;
  loadTurnstile?: boolean;
  deterrents?: { devtools?: boolean; contextMenu?: boolean; shortcuts?: boolean };
  noise?: { enabled?: boolean; canaryPrefix?: string; decoyMin?: number; decoyMax?: number };
  forensic?: { enabled?: boolean; notice?: string };
  /** Temporal (flicker-fusion) screenshot defense for opt-in regions. */
  temporal?: TemporalOptions & { selector: string };
  /** HDCP output-path gate: blur a region when the link is untrusted. */
  hdcp?: HdcpGateOptions & { gate: string };
  onError?: (err: unknown) => void;
}

export interface TemporalOptions {
  /** Frames to split across (≥2); more frames = noisier single capture. */
  frames?: number;
  /** Per-frame luminance offset magnitude (0–255). */
  noise?: number;
  /** Max swap frequency in Hz (0 = every animation frame). */
  hz?: number;
  /** Disable entirely under prefers-reduced-motion (default true; keep it). */
  respectReducedMotion?: boolean;
}
export function applyTemporal(targets: string | Element | Iterable<Element>, opts?: TemporalOptions): void;

export type HdcpStatus = "usable" | "output-restricted" | "output-downscaled" | "unknown" | string;
export function checkHdcp(opts?: { minHdcpVersion?: string }): Promise<HdcpStatus>;
export interface HdcpGateOptions {
  minHdcpVersion?: string;
  /** Hide when the check is unsupported (fail-closed). Default false (fail-open). */
  hideOnUnknown?: boolean;
  revealOnTrusted?: boolean;
  onChange?: (status: HdcpStatus, trusted: boolean) => void;
}
export function installHdcpGate(target: string | Element, opts?: HdcpGateOptions): () => void;

export function createHelmetRuntime(options?: HelmetRuntimeOptions): { ready: Promise<HelmetSession> };
export function installDeterrents(opts?: { devtools?: boolean; contextMenu?: boolean; shortcuts?: boolean; onWipe?: () => void }): void;
export function installForensicOverlay(sid: number, opts?: { notice?: string }): void;
export function installStructureNoise(seed: number, opts?: { canaryPrefix?: string; decoyMin?: number; decoyMax?: number }): void;
