const safeShellCharsRE = /^[A-Za-z0-9,:=_\.\/\-]+$/;
const singleQuoteSpanRE = /'+/g;

function trimMaybe(v: string, shouldTrim: boolean): string {
  return shouldTrim ? v.trim() : v;
}

async function writeAll(w: Deno.Writer, arr: Uint8Array) {
  // This is copied from Deno's std lib just to avoid deps, the function seems simple enough to be included.
  let nwritten = 0;
  while (nwritten < arr.length) {
    nwritten += await w.write(arr.subarray(nwritten));
  }
}

type ShellArgumentType = string | number | boolean | BigInt;

/**
 * Quote a string so that it's safe to use as a shell command argument.
 */
export function quoteString(s: string): string {
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
export function quote(
  pieces: TemplateStringsArray,
  ...args: Array<ShellArgumentType[] | ShellArgumentType>
) {
  let result = pieces[0];
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (Array.isArray(a)) {
      result += a.map((v) => quoteString(String(v))).join(" ");
    } else {
      result += quoteString(String(a));
    }
    result += pieces[i + 1];
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
  code: number;
  stdout: string;
  stderr: string;
  cmd: string;
  elapsedMilliseconds: number;
}

/**
 * Result of a shell command execution (raw binary form).
 */
export interface ShellResultBinary {
  code: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
  cmd: string;
  elapsedMilliseconds: number;
}

/**
 * Shell command execution options.
 */
export interface ShellOptions {
  /** Path to shell binary (default: `"/bin/bash"`) */
  shell?: string;
  /** Arguments to invoke shell with, the last should be the "command" argument (default: `["-c"]`) */
  shellArgs?: string[];
  /** Whether to trim textual stdout and stderr or not (default: `true`) */
  trim?: boolean;
  /** Environment variables to pass to the shell subprocess (default: `Deno.env.toObject()`) */
  env?: { [index: string]: string };
  /** Standard input to pass to the shell subprocess (default: `undefined`) */
  stdin?: string | Uint8Array;
}

/**
 * This function produces a shell executing tag function.
 *
 * This one in particular produces a binary variant of a tag function. In most cases you should use the default
 * `sh` executor. Or a custom textual executor producer `shOpt`. The `shOptBin` should be used for rare cases
 * when you need to process binary output or for cases when default utf-8 text decoding does not suit your needs.
 */
export function shOptBin(opt: ShellOptions) {
  return async (
    pieces: TemplateStringsArray,
    ...args: Array<ShellArgumentType[] | ShellArgumentType>
  ): Promise<ShellResultBinary> => {
    const cmd = quote(pieces, ...args);
    const t0 = Date.now();
    const p = Deno.run({
      cmd: [opt.shell ?? "/bin/bash", ...(opt.shellArgs ?? ["-c"]), cmd],
      env: opt.env ?? Deno.env.toObject(),
      stdin: "piped",
      stderr: "piped",
      stdout: "piped",
    });
    const [status, stdout, stderr] = await Promise.all([
      p.status(),
      p.output(),
      p.stderrOutput(),
    ]);
    if (opt.stdin !== undefined) {
      await writeAll(
        p.stdin,
        typeof opt.stdin === "string"
          ? new TextEncoder().encode(opt.stdin)
          : opt.stdin,
      );
    }
    p.close();
    return {
      code: status.code,
      stdout,
      stderr,
      cmd,
      elapsedMilliseconds: Date.now() - t0,
    };
  };
}

/**
 * This function produces a shell executing tag function.
 *
 * In most cases you should use the default `sh` executor. Alternatively a custom binary executor producer `shOptBin`
 * is available when default utf-8 output decoding does not suit your needs.
 */
export function shOpt(opt: ShellOptions) {
  const bin = shOptBin(opt);
  return async (
    pieces: TemplateStringsArray,
    ...args: Array<ShellArgumentType[] | ShellArgumentType>
  ): Promise<ShellResult> => {
    const result = await bin(pieces, ...args);
    return {
      ...result,
      stdout: trimMaybe(
        new TextDecoder().decode(result.stdout),
        opt.trim ?? true,
      ),
      stderr: trimMaybe(
        new TextDecoder().decode(result.stderr),
        opt.trim ?? true,
      ),
    };
  };
}

/**
 * Shell executing tag function.
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
export const sh = shOpt({});
