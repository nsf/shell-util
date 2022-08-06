import { sh, shOpt } from "../mod.ts";
import { printShellResult } from "../print.ts";

const shBin = shOpt({}, "binary");

printShellResult(await shBin`echo ${"Printing binary result"}`, { verbose: true });
printShellResult(await shBin`echo ${"Привет, мир! UTF-8 Example (non-zero exit code)"} && exit 4`);
printShellResult(await sh`echo ${"Printing textual result"}`, { verbose: true });
printShellResult(await sh`echo ${"Привет, мир! UTF-8 Example (stderr)"} 1>&2 && exit 1`);
