import type { HelmetConfig, Obfuscator } from "@helmet/core";
import type { Plugin } from "vite";

export interface HelmetPluginOptions {
  config: HelmetConfig;
  root?: string;
  /** Globs to extract class/id names from when not listed in config. */
  sources?: string[];
  /** Which emitted JS modules to run through javascript-obfuscator. */
  jsInclude?: RegExp;
}

/** Returns Vite plugins; the array also carries `.obfuscator` for tooling. */
export function helmet(opts: HelmetPluginOptions): Plugin[] & { obfuscator: Obfuscator };

export function writePublicAllowlist(
  distDir: string,
  opts?: { excludeDirs?: string[]; excludeFiles?: string[]; out?: string }
): string[];

export function collectNames(sources: string[], root?: string): { classes: string[]; ids: string[] };

export function auditDist(
  distDir: string,
  opts?: { copy?: string[]; keep?: string[]; excludeDirs?: string[] }
): { errors: string[]; warnings: string[] };

export function writeLegal(
  outDir: string,
  opts: { name: string; url?: string; email?: string }
): string[];
