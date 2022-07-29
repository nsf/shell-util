import { assertEquals } from "https://deno.land/std@0.150.0/testing/asserts.ts";
import { quote, quoteString } from "./mod.ts";

Deno.test("quoteString", () => {
  assertEquals(quoteString(`-param=value`), `-param=value`);
  assertEquals(quoteString(`a b`), `'a b'`);
  assertEquals(quoteString(`$foo`), `'$foo'`);
  assertEquals(quoteString(`foo`), `foo`);
  assertEquals(quoteString(`"double"`), `'"double"'`);
  assertEquals(quoteString(`'single'`), `"'"'single'"'"`);
  assertEquals(quoteString(`''''`), `"''''"`);
  assertEquals(quoteString(`'''`), `"'''"`);
  assertEquals(quoteString(`''`), `"''"`);
  assertEquals(quoteString(`'`), `"'"`);
  assertEquals(quoteString(`' '`), `"'"' '"'"`);
});

Deno.test("quote", () => {
  {
    const v = quote`ls -l ${"$foo"} ${31337}`;
    assertEquals(v, `ls -l '$foo' 31337`);
  }
  {
    const args = [5, true, "-v", "this is a sentence"];
    const v = quote`command ${args}`;
    assertEquals(v, `command 5 true -v 'this is a sentence'`);
  }
});
