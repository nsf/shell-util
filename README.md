# Shell utilities for deno

Shell scripting helper functions for deno.

## Basic usage

```typescript
import { sh } from "https://deno.land/x/shell-util/mod.ts";

const result = await sh`ls -l`;
console.log(result.stdout);
```

## Pretty printing

Additional module for pretty printing the result of shell execution is provided. E.g.:

```typescript
import { sh } from "https://deno.land/x/shell-util/mod.ts";
import { printShellResult } from "https://deno.land/x/shell-util/print.ts";

printShellResult(await sh`ls -l`);
```

## Examples

See "examples" dir for advanced usage examples.

## A note on security

Main purpose of this module is to utilize /bin/bash and shells alike. It implies that a shell command will be executed at some point. Which means all the deno security permissions are cancelled. Shell script may do whatever it feels like doing disregarding the currently imposed deno filesystem access restrictions for example.

The goal here is to bridge deno world and shell scripting world. Shell scripts are not secure. Be aware what you're running. It's recommended to use this module in user facing scripts only and avoid using it when making libraries.