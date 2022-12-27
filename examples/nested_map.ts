import { sh } from "../mod.ts";

const sh2 = sh.map({
  pre: (cmd) => {
    console.log("PRE 1");
    return cmd;
  },
  post: (r) => {
    console.log("POST 1");
    return r;
  },
  finalize: () => {
    console.log("FINALIZE 1");
  },
});

const sh3 = sh2.map({
  pre: (cmd) => {
    console.log("PRE 2");
    return cmd;
  },
  post: (r) => {
    console.log("POST 2");
    return r.code;
  },
  finalize: () => {
    console.log("FINALIZE 2");
  },
});

const sh4 = sh3.map({
  pre: (cmd) => {
    console.log("PRE 3");
    return cmd;
  },
  post: (r) => {
    console.log("POST 3");
    return r;
  },
  finalize: () => {
    console.log("FINALIZE 3");
  },
});

const code = await sh4`echo ${"Hello, world"}`;
console.log(code);
