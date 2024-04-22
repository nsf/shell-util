import { sh } from "../mod.ts";

{
  console.log(`stream the stdout of the command while it's running:`);
  await sh`echo 1 > /dev/tty; sleep 1; echo 2 > /dev/tty; sleep 1; echo 3 > /dev/tty; sleep 1;`;
}