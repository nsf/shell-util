import { ShellResult, ShellResultBinary, TagFunction } from "./mod.ts";
import { FormatOptions, formatShellResult, makeControlCharactersVisible } from "./print.ts";
import { ansi, colors } from "./deps/cliffy_ansi.ts";

const spinnerFrames = ["|", "/", "-", "\\"];

// Wrap a tag function with a spinner printer. Note that it's not concurrency aware, you cannot run multiple commands
// in parallel with it, it will mess up the screen.
//
// See also: ./examples/spinner.ts
export function wrapWithSpinnerPrinter<T extends ShellResult | ShellResultBinary>(
  f: TagFunction<T>,
  opts?: FormatOptions,
): TagFunction<T> {
  const te = new TextEncoder();
  const col = opts?.colors ?? true;
  const thru = (v: string) => v;
  const brightRed = col ? colors.brightRed : thru;
  const boldWhite = col ? colors.bold.brightWhite : thru;
  const red = col ? colors.red : thru;

  let timeout: number | undefined;
  let frame = 0;
  const nextFrame = () => {
    frame = (frame + 1) % spinnerFrames.length;
    Deno.stdout.writeSync(ansi.cursorBackward(1).text(spinnerFrames[frame]).toBuffer());
    timeout = setTimeout(nextFrame, 80);
  };
  const startSpinner = () => {
    clearTimeout(timeout);
    timeout = undefined;
    Deno.stdout.writeSync(te.encode(spinnerFrames[frame]));
    timeout = setTimeout(nextFrame, 80);
  };
  const stopSpinner = () => {
    clearTimeout(timeout);
    timeout = undefined;
    Deno.stdout.writeSync(ansi.cursorBackward(1).eraseLineEnd.toBuffer());
  };

  let t0 = 0;
  return f.map({
    pre: (cmd) => {
      t0 = Date.now();
      Deno.stdout.writeSync(te.encode(boldWhite("⇒ ") + makeControlCharactersVisible(cmd) + " "));
      startSpinner();
      return cmd;
    },
    post: (result) => {
      stopSpinner();
      console.log(formatShellResult(result, { ...opts, omitCmd: true }));
      return result;
    },
    finalize: () => {
      const isException = timeout !== undefined;
      stopSpinner();
      if (isException) {
        const elapsedMs = Date.now() - t0;
        const elapsedSuffix = ` [${elapsedMs / 1000}s]`;
        console.log(`${red("✘")}${elapsedSuffix} ${brightRed("(EXCEPTION)")}`);
      }
    },
  });
}
