import type { ShellResult, ShellResultBinary } from "./mod.ts";
import { brightRed, gray, green, red } from "@std/fmt/colors";
import { encodeHex } from "@std/encoding/hex";

// Cloning Go's hex.Dump style here.
function binaryToString(bytes: Uint8Array, limit?: number): string {
  if (bytes.length === 0) return "";
  if (limit !== undefined) bytes = bytes.subarray(0, limit);
  const hexBytes = encodeHex(bytes);
  let buf = "";
  for (let offset = 0; offset < bytes.length; offset += 16) {
    if (offset !== 0) buf += "\n";
    const bslice = String.fromCharCode(...bytes.subarray(offset, offset + 16).map((v) => v < 32 || v > 126 ? 46 : v))
      .padEnd(16);
    const hslice = hexBytes.substring(offset * 2, (offset + 16) * 2).padEnd(32);

    buf += `${offset.toString(16).padStart(8, "0")}  `;
    for (let i = 0; i < 16; i++) {
      buf += hslice.substring(i * 2, i * 2 + 2);
      buf += " ";
      if (i === 7 || i === 15) buf += " ";
    }
    buf += `│${bslice}│`;
  }
  return buf;
}

// Replace some special characters with their visible unicode counterparts.
// See: https://en.wikipedia.org/wiki/C0_and_C1_control_codes
//
// formatShellResult uses this function unconditionally when printing the command.
export function makeControlCharactersVisible(v: string): string {
  return v.replace(/\n/g, "␊").replace(/\t/g, "␉").replace(/\r/g, "␍");
}

function outputToString(v: string | Uint8Array, maxBytes?: number) {
  return typeof v === "string" ? v : binaryToString(v, maxBytes);
}

function countLines(v: string) {
  const r = /\n/g;
  let i = 0;
  while (true) {
    const m = r.exec(v);
    if (!m) break;
    i++;
  }
  return i + 1;
}

function linesText(v: string) {
  const n = countLines(v);
  return `${n} line${optS(n)}`;
}

function optS(n: number) {
  return n > 1 ? "s" : "";
}

function outputStatus(v: string | Uint8Array, trimmed: boolean | undefined, maxBytes: number | undefined) {
  const props: string[] = [];
  if (typeof v === "string") {
    props.push("utf-8" + (trimmed ? " (trimmed)" : ""));
    props.push(linesText(v));
    props.push(`${v.length} character${optS(v.length)}`);
  } else {
    props.push("binary");
    props.push(`${v.byteLength} byte${optS(v.byteLength)}`);
    if (maxBytes !== undefined && v.byteLength > maxBytes) {
      props.push(`${maxBytes} bytes printed`);
    }
  }
  return props.join(" | ");
}

export interface FormatOptions {
  /**
   * Print stdout/stderr on success.
   *
   * Default: `false`
   */
  verbose?: boolean;
  /**
   * Avoid printing stdout/stderr on failure.
   *
   * Default: `false`
   */
  suppressOutput?: boolean;
  /**
   * Limit amount of bytes which are printed for binary output.
   *
   * - Set it to 0 to suppress binary output.
   * - Set it to "unlimited" to make it unlimited.
   *
   * Default: `320`
   */
  maxBytes?: number | "unlimited";
  /**
   * Annotate stdout/stderr with a header containing short summary about the output.
   *
   * Default: `true`
   *
   * Example:
   * ```
   * [ STDOUT | binary | 106943 bytes | 320 bytes printed ]
   * ...
   * [ STDERR | utf-8 (trimmed) | 1 line | 26 characters ]
   * ...
   * ```
   */
  annotate?: boolean;
  /**
   * Whether to use ANSI colors for output.
   *
   * Default: `true`
   */
  colors?: boolean;
  /**
   * Omit cmd when printing the result.
   *
   * Default: `false`
   */
  omitCmd?: boolean;
  /**
   * Success prefix. Prepended to command when printing with code === 0.
   *
   * Default: `"✔"`
   */
  successPrefix?: string;
  /**
   * Error prefix. Prepended to command when printing with code !== 0.
   *
   * Default: `"✘"`
   */
  errorPrefix?: string;
}

/**
 * Format shell result to human friendly string.
 */
export function formatShellResult(result: ShellResult | ShellResultBinary, opts?: FormatOptions): string {
  const col = opts?.colors ?? true;
  const thru = (v: string) => v;
  const cgreen = col ? green : thru;
  const cred = col ? red : thru;
  const cbrightRed = col ? brightRed : thru;
  const cgray = col ? gray : thru;

  let str = "";
  const elapsedSuffix = ` [${result.elapsedMilliseconds / 1000}s]`;
  const maxBytes = opts?.maxBytes === "unlimited" ? undefined : Math.max(0, opts?.maxBytes ?? 320);
  let out = "";
  let err = "";
  const cmd = opts?.omitCmd ? "" : makeControlCharactersVisible(result.cmd);
  if (!result.code) {
    // success
    if (opts?.verbose) {
      out = outputToString(result.stdout, maxBytes);
      err = outputToString(result.stderr, maxBytes);
    }
    const hasOutput = !!out || !!err;
    const colon = hasOutput ? ":" : "";
    if (str) str += "\n";
    let prefix = opts?.successPrefix ?? "✔";
    if (prefix && cmd) prefix += " ";
    str += cgreen(`${prefix}${cmd}`) + elapsedSuffix + colon;
  } else {
    // error
    if (!opts?.suppressOutput) {
      out = outputToString(result.stdout, maxBytes);
      err = outputToString(result.stderr, maxBytes);
    }
    const hasOutput = !!out || !!err;
    const colon = hasOutput ? ":" : "";
    if (str) str += "\n";
    let prefix = opts?.errorPrefix ?? "✘";
    if (prefix && cmd) prefix += " ";
    str += cred(`${prefix}${cmd}`) + elapsedSuffix + cbrightRed(` (${result.code})`) + colon;
  }
  if (out) {
    if (opts?.annotate ?? true) {
      if (str) str += "\n";
      str += cgray(`[ STDOUT | ${outputStatus(result.stdout, result.trimmed, maxBytes)} ]`);
    }
    if (str) str += "\n";
    str += out;
  }
  if (err) {
    if (opts?.annotate ?? true) {
      if (str) str += "\n";
      str += cgray(`[ STDERR | ${outputStatus(result.stderr, result.trimmed, maxBytes)} ]`);
    }
    if (str) str += "\n";
    str += err;
  }
  return str;
}

/**
 * A shortcut for `console.log(formatShellResult(result, opts))`.
 */
export function printShellResult(result: ShellResult | ShellResultBinary, opts?: FormatOptions) {
  console.log(formatShellResult(result, opts));
}
