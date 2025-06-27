import { describe, expect, it } from "vitest";
import { JSONChunk } from "~/lib/domain/chunk";
import { JSONTokenType } from "~/lib/domain/lexer";

describe("JSONChunk", () => {
  it("should create a JSONChunk", () => {
    // Arrange
    const value = "42";
    const type = JSONTokenType.Number;
    const segments: ReadonlyArray<string | number> = [];

    // Act
    const chunk = new JSONChunk(value, type, segments);

    // Assert
    expect(chunk.value).toBe("42");
    expect(chunk.type).toBe(JSONTokenType.Number);
    expect(chunk.segments).toEqual([]);
    expect(chunk.pointer).toBe("/");
    expect(chunk.path).toBe("$");
  });

  it.for([
    [[0], "$[0]", "/0"],
    [["single"], "$.single", "/single"],
    [[0, "key"], "$[0].key", "/0/key"],
    [["key", 0], "$.key[0]", "/key/0"],
    [["a", 0, "b", 1, "c", 2], "$.a[0].b[1].c[2]", "/a/0/b/1/c/2"],
    [["a", "b", "c", 0, 1, 2], "$.a.b.c[0][1][2]", "/a/b/c/0/1/2"],
    [[0, 1, 2, "a", "b", "c"], "$[0][1][2].a.b.c", "/0/1/2/a/b/c"],
  ])("should handle nested segments", ([segment, path, pointer]) => {
    // Arrange & Act
    const chunk = new JSONChunk(
      "",
      JSONTokenType.String,
      segment as Array<string | number>,
    );

    // Assert
    expect(chunk.path).toBe(path);
    expect(chunk.pointer).toBe(pointer);
  });

  it.for([
    [".", "key.with.dot", "$['key.with.dot']", "/key.with.dot"],
    ["*", "key*wild", "$['key*wild']", "/key*wild"],
    ["@", "@meta", "$['@meta']", "/@meta"],
    ["$", "$schema", "$['$schema']", "/$schema"],
    ["'", "key'quote", "$['key\\'quote']", "/key'quote"],
    ['"', 'key"quote', "$['key\"quote']", '/key"quote'],
    ["[' and ']", "key[]brackets", "$['key[]brackets']", "/key[]brackets"],
    ["/", "path/like", "$['path/like']", "/path~1like"],
    ["\\", "path\\to\\key", "$['path\\\\to\\\\key']", "/path\\to\\key"],
    ["#", "key#id", "$['key#id']", "/key#id"],
    ["-", "key-name", "$['key-name']", "/key-name"],
    ["+", "key+value", "$['key+value']", "/key+value"],
    [":", "key:value", "$['key:value']", "/key:value"],
    [",", "key,other", "$['key,other']", "/key,other"],
    [" ", "key with space", "$['key with space']", "/key with space"],
    ["(' and ')", "func(key)", "$['func(key)']", "/func(key)"],
    ["{' and '}", "{key}", "$['{key}']", "/{key}"],
    ["=", "key=value", "$['key=value']", "/key=value"],
    ["!", "!important", "$['!important']", "/!important"],
    ["~", "tilde~key", "$['tilde~key']", "/tilde~0key"],
    ["", "", "$['']", "/"],
  ])(
    "should escape special character '%s' in JSONPath and JSON Pointer",
    ([char, key, path, pointer]) => {
      // Arrange & Act
      const chunk = new JSONChunk(key, JSONTokenType.String, [key]);

      // Assert
      expect(chunk.path).toBe(path);
      expect(chunk.pointer).toBe(pointer);
    },
  );

  it("should escape combinations of tilde and slash characters in JSON pointer", () => {
    // Arrange & Act
    const chunk = new JSONChunk("value", JSONTokenType.String, [
      "key~/with/~tildes",
    ]);

    // Assert
    expect(chunk.path).toBe("$['key~/with/~tildes']");
    expect(chunk.pointer).toBe("/key~0~1with~1~0tildes");
  });

  it("should handle numerical string segments", () => {
    // Arrange & Act
    const chunk = new JSONChunk("value", JSONTokenType.String, ["123", "456"]);

    // Assert
    expect(chunk.path).toBe("$['123']['456']");
    expect(chunk.pointer).toBe("/123/456");
  });
});
