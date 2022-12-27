import { sh } from "../mod.ts";
import { wrapWithSpinnerPrinter } from "../spinner.ts";

const spinShE = wrapWithSpinnerPrinter(
  sh.map((result) => {
    if (result.code !== 0) throw new Error("failure!");
    return result;
  }),
  { annotate: false },
);

const spinSh = wrapWithSpinnerPrinter(sh, { annotate: false });

try {
  await spinSh`sleep 1 && echo "Success!"`;
  await spinSh`sleep 3 && echo "This is an error!" 1>&2 && exit 1`;
  await spinSh`sleep 1 && echo "Success!"`;
  await spinShE`sleep 1 && echo "This is an error as exception!" 1>&2 && exit 1`;
} catch (e) {
  console.log("OOPS!");
  throw e;
}
