import { beforeEach, describe, expect, it } from "vitest";

describe("Array Parsing", () => {
  const values =
    '[false,null,true,0,42,-17,3.14159,-0.001,1.23e10,-4.56E-7,1e+5,"Hello World","","\\"","\\\\","\/","\\b","\\f","\\n","\\r","\\t","\u0041",{},[]]';
  const nestedValues =
    '[[false,null,true],[0,42,-17,3.14159,-0.001,1.23e10,-4.56E-7,1e+5],["Hello World","","\\"","\\\\","\/","\\b","\\f","\\n","\\r","\\t","\u0041"],[{},[],[{"level4":[null,false,true,42,"deep thought"]},[]]]]';
});
