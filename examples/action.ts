import { action, shAction, SkipError, TimeoutError } from "../action.ts";

await action("Successful long-running action", async () => {
  await shAction`sleep 2`;
});
await action("This action will be skipped, eventually", async () => {
  await shAction`sleep 2`;
  throw new SkipError();
});
try {
  await action("This action will timeout", async () => {
    await shAction`sleep 4`;
  }, { timeoutSeconds: 1 });
} catch (err: unknown) {
  if (err instanceof TimeoutError) {
    // do nothing
  } else {
    throw err;
  }
}
await action("This action will result in an error", async () => {
  await shAction`sleep 2`;
  await shAction`echo ${"Very bad error happened"} 1>&2 && exit 1`;
});
