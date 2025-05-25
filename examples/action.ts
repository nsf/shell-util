import { action, shAction, shActionOpt, SkipError, TimeoutError } from "../action.ts";

await action("Successful long-running action", async () => {
  await shAction`sleep 2`;
});
let terminated = false;
try {
  await action("This action will timeout", async (signal) => {
    try {
      while (true) {
        await shActionOpt({ signal })`sleep 1`;
      }
    } finally {
      terminated = true;
    }
  }, { timeoutSeconds: 1.2 });
} catch (err: unknown) {
  if (err instanceof TimeoutError) {
    // do nothing
  } else {
    throw err;
  }
}
await action("This action will be skipped, eventually", async () => {
  await shAction`sleep 2`;
  throw new SkipError();
});
// Note that terminated = true, because aborted signal causes command to be terminated via SIGTERM, which in turn
// results in shAction throwing an error, but because it happens after timeout, the error is ignored by action as
// part of the Promise.race logic. Never the less it leads to loop termination, which is the intention.
console.log(`terminated: ${terminated}`);
await action("This action will result in an error", async () => {
  await shAction`sleep 2`;
  await shAction`echo ${"Very bad error happened"} 1>&2 && exit 1`;
});
