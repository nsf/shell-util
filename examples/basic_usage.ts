import { sh } from "../mod.ts";

{
  console.log(`run the command and print output:`);
  const result = await sh`ls -l`;
  console.log(result.stdout);
}

{
  console.log(`create a custom shell executor tag function using .map():`);
  const shOut = sh.map((result) => {
    if (result.code) {
      throw new Error(`ERROR (${result.code}): ${result.cmd}`);
    }
    return result.stdout;
  });
  console.log(await shOut`ls -l`);
}
