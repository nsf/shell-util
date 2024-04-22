const safeShellCharsRE = /^[A-Za-z0-9,:=_\.\/\-]+$/;
const singleQuoteSpanRE = /'+/g;

function trimMaybe(v: string, shouldTrim: boolean): string {
  return shouldTrim ? v.trim() : v;
}

export type ShellArgumentType = string | number | boolean | bigint;

/**
 * Quote a string so that it's safe to use as a shell command argument.
 */
export function quoteString(s: string): string {
  if (!s) return "''";
  if (safeShellCharsRE.test(s)) return s;
  s = "'" + s.replace(singleQuoteSpanRE, (m) => `'"${m}"'`) + "'";
  s = s.replace(/^''/, "");
  s = s.replace(/''$/, "");
  return s;
}

/**
 * Process the template string making it suitable to be executed as a shell command.
 *
 * This is a tag function for JS template literals. All arguments are processed through `quoteString`. Non-string
 * arguments are coerced to string first. Additionally this function works with arrays of arguments, each element
 * in the array is coerced to string and processed via `quoteString` and then the results are joined with a
 * space in-between.
 *
 * Empty arrays are handled in a special way sometimes resulting in spaces being removed. For example:
 * ```
 * quote`foo ${[]} bar`
 * quote`foo ${[]}`
 * ```
 * will be formatted as `foo bar` and `foo` respectively.
 *
 * Examples:
 *
 * - ```
 *   const v = quote`ls -l ${"$foo"} ${31337}`;
 *   assertEquals(v, `ls -l '$foo' 31337`);
 *   ```
 * - ```
 *   const args = [5, true, "-v", "this is a sentence"];
 *   const v = quote`command ${args}`;
 *   assertEquals(v, `command 5 true -v 'this is a sentence'`);
 *   ```
 */
export function quote(pieces: TemplateStringsArray, ...args: Array<ShellArgumentType[] | ShellArgumentType>): string {
  let result = pieces[0];
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    let isEmptyArrayArg = false;
    if (Array.isArray(a)) {
      const aarg = a.map((v) => quoteString(String(v))).join(" ");
      if (aarg.length === 0) {
        isEmptyArrayArg = true;
      } else {
        result += aarg;
      }
    } else {
      result += quoteString(String(a));
    }
    let p = pieces[i + 1];
    if (isEmptyArrayArg) {
      if (p.length > 0 && p[0] === " ") {
        p = p.substring(1);
      } else if (result.length > 0 && result[result.length - 1] === " ") {
        result = result.substring(0, result.length - 1);
      }
    }
    result += p;
  }
  for (++i; i < pieces.length; i++) {
    result += pieces[i];
  }
  return result;
}

/**
 * Result of a shell command execution.
 */
export interface ShellResult {
  /** Command exit status code. Typically zero for success and non-zero for a failed command. */
  code: number;
  /** Standard output decoded as UTF-8 and trimmed (depending on `trim` option, see `ShellOptions`). */
  stdout: string;
  /** Standard error output decoded as UTF-8 and trimmed (depending on `trim` option, see `ShellOptions`). */
  stderr: string;
  /** Quoted command this `ShellResult` represents result of. Useful for printing and debugging. */
  cmd: string;
  /**
   * How many milliseconds it took executing this command. Default JS `Date` is used for measurement, thus precision
   * may vary.
   */
  elapsedMilliseconds: number;
  /**
   * Whether stdout/stderr trimming attempt was performed.
   */
  trimmed: boolean;
}

/**
 * Result of a shell command execution (raw binary form).
 */
export interface ShellResultBinary {
  /** Command exit status code. Typically zero for success and non-zero for a failed command. */
  code: number;
  /** Standard output. */
  stdout: Uint8Array;
  /** Standard error output. */
  stderr: Uint8Array;
  /** Quoted command this `ShellResultBinary` represents result of. Useful for printing and debugging. */
  cmd: string;
  /**
   * How many milliseconds it took executing this command. Default JS `Date` is used for measurement, thus precision
   * may vary.
   */
  elapsedMilliseconds: number;
  /**
   * Whether stdout/stderr trimming attempt was performed (irrelevant for binary output).
   */
  trimmed?: undefined;
}

/**
 * Shell command execution options.
 */
export interface ShellOptions {
  /**
   * Path to shell binary.
   *
   * Default: `"/bin/bash"`
   */
  shell?: string;
  /**
   * Arguments to invoke shell with, the last should be the "command" argument.
   *
   * Default: `["-c"]`
   */
  shellArgs?: string[];
  /**
   * Whether to trim textual stdout and stderr or not.
   *
   * Default: `true`
   */
  trim?: boolean;
  /**
   * Environment variables to pass to the shell subprocess.
   *
   * Default: `Deno.env.toObject()`
   */
  env?: { [index: string]: string };
  /**
   * Standard input to pass to the shell subprocess.
   *
   * Default: `undefined`
   */
  stdin?: string | Uint8Array;
}

export type PlainTagFunction<T> = (
  pieces: TemplateStringsArray,
  ...args: Array<ShellArgumentType[] | ShellArgumentType>
) => Promise<T>;

export interface MapParameters<T, U> {
  pre?: (cmd: string) => string;
  post: (result: T) => U;
  finalize?: () => void;
}

export interface TagFunction<T> extends PlainTagFunction<T> {
  map<U>(post: ((result: T) => U) | MapParameters<T, U>): TagFunction<U>;
}

function wrapTagFunction<T>(
  f: PlainTagFunction<T>,
  exec: (cmd: string) => Promise<T>,
  finalizers: Array<(() => void) | undefined> = [],
): TagFunction<T> {
  const ff = f as TagFunction<T>;
  ff.map = (arg) => {
    const p = typeof arg === "function" ? { post: arg } : arg;
    const nestedExec = async (cmd: string) => p.post(await exec(p.pre ? p.pre(cmd) : cmd));
    return wrapTagFunction(
      async (...args) => {
        try {
          const q = quote(...args);
          return p.post(await exec(p.pre ? p.pre(q) : q));
        } finally {
          for (const f of finalizers) {
            f?.();
          }
          p.finalize?.();
        }
      },
      nestedExec,
      [...finalizers, p.finalize],
    );
  };
  return ff;
}

function execOpt(opt: ShellOptions): (cmd: string) => Promise<ShellResultBinary> {
  return async (cmd: string): Promise<ShellResultBinary> => {
    const t0 = Date.now();
    const p = new Deno.Command(opt.shell ?? "/bin/bash", {
      args: [...(opt.shellArgs ?? ["-c"]), cmd],
      stdin: "piped",
      stderr: "piped",
      stdout: "piped",
      env: opt.env ?? Deno.env.toObject(),
    });
    const cp = p.spawn();
    if (opt.stdin !== undefined) {
      const stdinBuf = typeof opt.stdin === "string" ? new TextEncoder().encode(opt.stdin) : opt.stdin;
      const w = cp.stdin.getWriter();
      await w.write(stdinBuf);
      w.releaseLock();
    }
    await cp.stdin.close();
    const output = await cp.output();
    return {
      code: output.code,
      stdout: output.stdout,
      stderr: output.stderr,
      cmd,
      elapsedMilliseconds: Date.now() - t0,
    };
  };
}

/**
 * Produce a shell executing tag function.
 *
 * In most cases you should use the default `sh` executor instead.
 *
 * The output is decoded as utf-8 and returned as a string.
 */
export function shOpt(opt: ShellOptions, output?: "utf-8"): TagFunction<ShellResult>;
/**
 * Produce a shell executing tag function.
 *
 * In most cases you should use the default `sh` executor instead.
 *
 * The output is returned as is.
 */
export function shOpt(opt: ShellOptions, output: "binary"): TagFunction<ShellResultBinary>;
export function shOpt(
  opt: ShellOptions,
  output?: "binary" | "utf-8",
): TagFunction<ShellResult | ShellResultBinary> {
  const exec = execOpt(opt);
  if (output === "binary") {
    return wrapTagFunction((pieces, ...args) => exec(quote(pieces, ...args)), exec);
  }

  const binaryToText = (result: ShellResultBinary): ShellResult => {
    const shouldTrim = opt.trim ?? true;
    const td = new TextDecoder();
    return {
      ...result,
      stdout: trimMaybe(td.decode(result.stdout), shouldTrim),
      stderr: trimMaybe(td.decode(result.stderr), shouldTrim),
      trimmed: shouldTrim,
    };
  };
  const textExec = async (cmd: string) => binaryToText(await exec(cmd));
  return wrapTagFunction(async (pieces, ...args) => await textExec(quote(pieces, ...args)), textExec);
}

/**
 * Default shell executing tag function.
 *
 * This function will execute a formatted shell command and return the result. E.g.
 * ```
 * const result = await sh`ls -l`;
 * console.log(result.stdout);
 * ```
 *
 * The function performs proper shell quoting for template arguments. E.g.
 * ```
 * const name = "John Smith";
 * await sh`config set name ${name}`;
 * ```
 * will execute `config set name 'John Smith'`
 *
 * It is also possible to use arrays as arguments, the array elements will be quoted and concatenated with a space
 * as a separator. E.g.
 * ```
 * const args = ["-host", "127.0.0.1", "-port", 6500, "-name", "Jane Jones"];
 * await sh`start-server ${args}`;
 * ```
 * will execute `start-server -host 127.0.0.1 -port 6500 -name 'Jane Jones'`
 *
 * For reference, this is how an equivalent `ls -l` invocation will look like with `shOpt` executor producer:
 * ```
 * const result = await shOpt({
 *   shell: "/bin/bash",
 *   shellArgs: ["-c"],
 *   trim: true,
 *   env: Deno.env.toObject(),
 *   stdin: undefined,
 * })`ls -l`;
 * console.log(result.stdout);
 * ```
 */
export const sh: TagFunction<ShellResult> = shOpt({});
