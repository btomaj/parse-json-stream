import { beforeEach, describe, expect, it } from "vitest";

describe("String Parsing", () => {
  let parser: any;
  let events: any[];

  beforeEach(() => {
    events = [];
    // parser = new JsonStreamParser();
    // parser.on('value', (chunk) => events.push({ type: 'value', data: chunk }));
  });

  describe("Empty String Chunks", () => {
    it('single chunk: ""', () => {
      // parser.write('""');
    });

    it('two chunks: " + "', () => {
      // parser.write('"');
      // parser.write('"');
    });
  });

  describe("Simple String Chunks", () => {
    it('single chunk: "hello"', () => {
      // parser.write('"hello"');
    });

    it('split at opening quote: " + hello"', () => {
      // parser.write('"');
      // parser.write('hello"');
    });

    it('split at closing quote: "hello + "', () => {
      // parser.write('"hello');
      // parser.write('"');
    });

    it('split middle: "hel + lo"', () => {
      // parser.write('"hel');
      // parser.write('lo"');
    });

    it('character by character: " + h + e + l + l + o + "', () => {
      // parser.write('"');
      // parser.write('h');
      // parser.write('e');
      // parser.write('l');
      // parser.write('l');
      // parser.write('o');
      // parser.write('"');
    });
  });

  describe("Escaped String Chunks", () => {
    it('single chunk: "hello\\"world"', () => {
      // parser.write('"hello\\"world"');
    });

    it('split at escape: "hello\\ + "world"', () => {
      // parser.write('"hello\\');
      // parser.write('"world"');
    });

    it('split after escape: "hello\\" + world"', () => {
      // parser.write('"hello\\"');
      // parser.write('world"');
    });

    it('escape at chunk end: "test\\ + n"', () => {
      // parser.write('"test\\');
      // parser.write('n"');
    });

    it('double escape split: "test\\\\ + more"', () => {
      // parser.write('"test\\\\');
      // parser.write('more"');
    });

    it('unicode escape split: "\\u00 + 41"', () => {
      // parser.write('"\\u00');
      // parser.write('41"');
    });
  });

  describe("String with JSON Characters", () => {
    it('single chunk: "object: {key: value}"', () => {
      // parser.write('"object: {key: value}"');
    });

    it('split at brace: "object: { + key: value}"', () => {
      // parser.write('"object: {');
      // parser.write('key: value}"');
    });

    it('brackets split: "[1,2, + 3]"', () => {
      // parser.write('"[1,2,');
      // parser.write('3]"');
    });

    it('colon split: "key: + value"', () => {
      // parser.write('"key:');
      // parser.write(' value"');
    });
  });

  describe("Long String Chunks", () => {
    it("many small chunks throughout long string", () => {
      const content = "a".repeat(100);
      // parser.write('"');
      for (let i = 0; i < content.length; i += 10) {
        // parser.write(content.slice(i, i + 10));
      }
      // parser.write('"');
    });

    it("single character chunks", () => {
      const string = '"hello world"';
      for (const char of string) {
        // parser.write(char);
      }
    });
  });

  describe("Empty Chunks", () => {
    it('empty chunks between content: "" + hello + "" + "', () => {
      // parser.write('');
      // parser.write('"hello');
      // parser.write('');
      // parser.write('"');
    });
  });
});
