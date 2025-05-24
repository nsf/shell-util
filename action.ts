import { sh, type ShellResult, type TagFunction } from "./mod.ts";
import { type FormatOptions, formatShellResult } from "./print.ts";
import { green, red, yellow } from "@std/fmt/colors";

const timeoutSymbol = Symbol("timeout");
type TimeoutSymbol = typeof timeoutSymbol;
const thru = (v: string) => v;

/**
 * Configuration options for controlling action execution behavior.
 */
export interface Config {
  /**
   * Timeout duration in seconds before an action is considered timed out.
   *
   * Default: `120`
   */
  timeoutSeconds?: number;
  /**
   * Verbosity level for logging action execution.
   *
   * Default: `"verbose"`
   */
  verbosity?: "verbose" | "quiet";
  /**
   * Whether to use ANSI colors for output.
   *
   * Default: `true`
   */
  colors?: boolean;
  /**
   * Formatting options for printing command results on failure.
   *
   * Default: `{ successPrefix: "", errorPrefix: "" }`
   */
  formatOptions?: FormatOptions;
}

/**
 * Default configuration values. Can be overridden at runtime to suit program needs.
 */
export const defaultConfig: Config = {
  timeoutSeconds: 120,
  verbosity: "verbose" as "verbose" | "quiet",
  colors: true,
  formatOptions: { successPrefix: "", errorPrefix: "" },
};

/**
 * Custom error class for shell command execution failures.
 * Thrown by `shAction` when a command exits with a non-zero code.
 */
export class ShellError extends Error {
  result: ShellResult;
  constructor(result: ShellResult) {
    super(`${result.cmd} exited with code ${result.code}`);
    this.result = result;
    this.name = this.constructor.name;
    this.stack = new Error().stack;
  }
}

interface TimeoutCookie {
  timeoutId: number | undefined;
}

function clearTimeoutCookie(tc: TimeoutCookie) {
  if (tc.timeoutId !== undefined) {
    clearTimeout(tc.timeoutId);
    tc.timeoutId = undefined;
  }
}

async function timeoutPromise<T>(tc: TimeoutCookie, p: Promise<T>, timeoutSeconds: number): Promise<T | TimeoutSymbol> {
  const timeoutPromise = new Promise<TimeoutSymbol>((resolve) => {
    tc.timeoutId = setTimeout(() => {
      resolve(timeoutSymbol);
    }, timeoutSeconds * 1000);
  });
  const result = await Promise.race([p, timeoutPromise]);
  clearTimeoutCookie(tc);
  return result;
}

/**
 * Custom error class for actions that are intentionally skipped.
 */
export class SkipError extends Error {
  constructor() {
    super("action is skipped");
    this.name = this.constructor.name;
    this.stack = new Error().stack;
  }
}

/**
 * Custom error class for actions that are timed out.
 */
export class TimeoutError extends Error {
  constructor() {
    super("action timed out");
    this.name = this.constructor.name;
    this.stack = new Error().stack;
  }
}

/**
 * Shell tag function wrapper that throws `ShellError` on non-zero exit codes.
 */
export const shAction: TagFunction<ShellResult> = sh.map((result) => {
  if (result.code !== 0) {
    throw new ShellError(result);
  }
  return result;
});

/**
 * A function that lets you group long-running actions into meaningful steps with nice logging.
 *
 * - Throwing an exception marks the action as failed, logs the error, and re-throws the exception.
 *   For shell commands, use the `shAction` wrapper to automatically throw an error on non-zero exit codes.
 * - Configurable timeouts prevent actions from running indefinitely. Set timeouts via the `config` parameter
 *   or globally in `defaultConfig`.
 * - Throw a `SkipError` to log the action as skipped without re-throwing the exception.
 */
export async function action<T>(label: string, f: () => Promise<T>, config?: Config): Promise<T> {
  const v = config?.verbosity ?? defaultConfig?.verbosity ?? "verbose";
  const te = new TextEncoder();
  if (v) Deno.stdout.writeSync(te.encode(`${label}... `));
  const tc: TimeoutCookie = { timeoutId: undefined };
  const t0 = Date.now();
  try {
    const timeoutSeconds = config?.timeoutSeconds ?? defaultConfig?.timeoutSeconds ?? 120;
    const result = await timeoutPromise(tc, f(), timeoutSeconds);
    if (result === timeoutSymbol) {
      throw new TimeoutError();
    } else {
      if (v) {
        const elapsed = (Date.now() - t0) / 1000;
        const cgreen = config?.colors ?? defaultConfig?.colors ?? true ? green : thru;
        Deno.stdout.writeSync(te.encode(`${cgreen("OK")} [${elapsed.toFixed(1)}s]\n`));
      }
      return result;
    }
  } catch (err) {
    if (err instanceof SkipError) {
      if (v) {
        const elapsed = (Date.now() - t0) / 1000;
        const cyellow = config?.colors ?? defaultConfig?.colors ?? true ? yellow : thru;
        Deno.stdout.writeSync(te.encode(`${cyellow("SKIPPED")} [${elapsed.toFixed(1)}s]\n`));
      }
      return undefined as T;
    }
    if (v) {
      const elapsed = (Date.now() - t0) / 1000;
      const errLabel = err instanceof TimeoutError ? "TIMEOUT" : "ERROR";
      const cred = config?.colors ?? defaultConfig?.colors ?? true ? red : thru;
      Deno.stdout.writeSync(te.encode(`${cred(errLabel)} [${elapsed.toFixed(1)}s]\n`));
    }
    if (err instanceof ShellError) {
      if (v) {
        const fmtOpts = config?.formatOptions ?? defaultConfig?.formatOptions;
        Deno.stdout.writeSync(te.encode(formatShellResult(err.result, fmtOpts) + "\n"));
      }
    }
    throw err;
  } finally {
    clearTimeoutCookie(tc);
  }
}
