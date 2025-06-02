import { beforeEach, describe, expect, it } from "vitest";

describe("Array Parsing", () => {
  let parser: any;
  let events: any[];

  beforeEach(() => {
    events = [];
    // parser = new JsonStreamParser();
    // parser.on('value', (chunk) => events.push({ type: 'value', data: chunk }));
    // parser.on('openArray', () => events.push({ type: 'openArray' }));
    // parser.on('closeArray', () => events.push({ type: 'closeArray' }));
  });

  describe("Empty Array Chunks", () => {
    it("single chunk: []", () => {
      // parser.write('[]');
    });

    it("split brackets: [ + ]", () => {
      // parser.write('[');
      // parser.write(']');
    });

    it("with whitespace: [ +   + ]", () => {
      // parser.write('[');
      // parser.write('  ');
      // parser.write(']');
    });
  });

  describe("Single Element Chunks", () => {
    it("single chunk: [123]", () => {
      // parser.write('[123]');
    });

    it("split at opening: [ + 123]", () => {
      // parser.write('[');
      // parser.write('123]');
    });

    it("split at closing: [123 + ]", () => {
      // parser.write('[123');
      // parser.write(']');
    });

    it("split in element: [12 + 3]", () => {
      // parser.write('[12');
      // parser.write('3]');
    });

    it("character by character: [ + 1 + 2 + 3 + ]", () => {
      // parser.write('[');
      // parser.write('1');
      // parser.write('2');
      // parser.write('3');
      // parser.write(']');
    });
  });

  describe("Multiple Elements Chunks", () => {
    it("single chunk: [1,2,3]", () => {
      // parser.write('[1,2,3]');
    });

    it("split at first comma: [1 + ,2,3]", () => {
      // parser.write('[1');
      // parser.write(',2,3]');
    });

    it("split after first comma: [1, + 2,3]", () => {
      // parser.write('[1,');
      // parser.write('2,3]');
    });

    it("split at second comma: [1,2 + ,3]", () => {
      // parser.write('[1,2');
      // parser.write(',3]');
    });

    it("split after second comma: [1,2, + 3]", () => {
      // parser.write('[1,2,');
      // parser.write('3]');
    });

    it("split in second element: [1,2 + 3]", () => {
      // parser.write('[1,2');
      // parser.write('3]');
    });

    it("character by character: [ + 1 + , + 2 + , + 3 + ]", () => {
      // parser.write('[');
      // parser.write('1');
      // parser.write(',');
      // parser.write('2');
      // parser.write(',');
      // parser.write('3');
      // parser.write(']');
    });
  });

  describe("String Elements Chunks", () => {
    it('single chunk: ["hello","world"]', () => {
      // parser.write('["hello","world"]');
    });

    it('split in first string: ["hel + lo","world"]', () => {
      // parser.write('["hel');
      // parser.write('lo","world"]');
    });

    it('split between strings: ["hello" + ,"world"]', () => {
      // parser.write('["hello"');
      // parser.write(',"world"]');
    });

    it('split in second string: ["hello","wor + ld"]', () => {
      // parser.write('["hello","wor');
      // parser.write('ld"]');
    });

    it('character by character: [ + " + h + e + l + l + o + " + , + " + w + o + r + l + d + " + ]', () => {
      // parser.write('[');
      // parser.write('"');
      // parser.write('h');
      // parser.write('e');
      // parser.write('l');
      // parser.write('l');
      // parser.write('o');
      // parser.write('"');
      // parser.write(',');
      // parser.write('"');
      // parser.write('w');
      // parser.write('o');
      // parser.write('r');
      // parser.write('l');
      // parser.write('d');
      // parser.write('"');
      // parser.write(']');
    });
  });

  describe("Mixed Type Elements Chunks", () => {
    it('single chunk: [1,"string",true,null]', () => {
      // parser.write('[1,"string",true,null]');
    });

    it('split at string: [1, + "string",true,null]', () => {
      // parser.write('[1,');
      // parser.write('"string",true,null]');
    });

    it('split in string: [1,"str + ing",true,null]', () => {
      // parser.write('[1,"str');
      // parser.write('ing",true,null]');
    });

    it('split at boolean: [1,"string", + true,null]', () => {
      // parser.write('[1,"string",');
      // parser.write('true,null]');
    });

    it('split in boolean: [1,"string",tr + ue,null]', () => {
      // parser.write('[1,"string",tr');
      // parser.write('ue,null]');
    });

    it('split at null: [1,"string",true, + null]', () => {
      // parser.write('[1,"string",true,');
      // parser.write('null]');
    });

    it('split in null: [1,"string",true,nu + ll]', () => {
      // parser.write('[1,"string",true,nu');
      // parser.write('ll]');
    });
  });

  describe("Nested Array Chunks", () => {
    it("single chunk: [[1,2],[3,4]]", () => {
      // parser.write('[[1,2],[3,4]]');
    });

    it("split at inner opening: [ + [1,2],[3,4]]", () => {
      // parser.write('[');
      // parser.write('[1,2],[3,4]]');
    });

    it("split at inner closing: [[1,2] + ,[3,4]]", () => {
      // parser.write('[[1,2]');
      // parser.write(',[3,4]]');
    });

    it("split between arrays: [[1,2], + [3,4]]", () => {
      // parser.write('[[1,2],');
      // parser.write('[3,4]]');
    });

    it("split in second array: [[1,2],[3, + 4]]", () => {
      // parser.write('[[1,2],[3,');
      // parser.write('4]]');
    });

    it("character by character: [ + [ + 1 + , + 2 + ] + , + [ + 3 + , + 4 + ] + ]", () => {
      // parser.write('[');
      // parser.write('[');
      // parser.write('1');
      // parser.write(',');
      // parser.write('2');
      // parser.write(']');
      // parser.write(',');
      // parser.write('[');
      // parser.write('3');
      // parser.write(',');
      // parser.write('4');
      // parser.write(']');
      // parser.write(']');
    });
  });

  describe("Array with Objects Chunks", () => {
    it('single chunk: [{"a":1},{"b":2}]', () => {
      // parser.write('[{"a":1},{"b":2}]');
    });

    it('split at object opening: [ + {"a":1},{"b":2}]', () => {
      // parser.write('[');
      // parser.write('{"a":1},{"b":2}]');
    });

    it('split at object closing: [{"a":1} + ,{"b":2}]', () => {
      // parser.write('[{"a":1}');
      // parser.write(',{"b":2}]');
    });

    it('split between objects: [{"a":1}, + {"b":2}]', () => {
      // parser.write('[{"a":1},');
      // parser.write('{"b":2}]');
    });

    it('split in object key: [{"a":1},{"b + ":2}]', () => {
      // parser.write('[{"a":1},{"b');
      // parser.write('":2}]');
    });

    it('split in object value: [{"a":1},{"b":2 + }]', () => {
      // parser.write('[{"a":1},{"b":2');
      // parser.write('}]');
    });
  });

  describe("Deep Nesting Chunks", () => {
    it("three levels: [[[1]]]", () => {
      // parser.write('[[[1]]]');
    });

    it("split at middle level: [ + [[1]]]", () => {
      // parser.write('[');
      // parser.write('[[1]]]');
    });

    it("split at innermost: [[ + [1]]]", () => {
      // parser.write('[[');
      // parser.write('[1]]]');
    });

    it("split at element: [[[1 + ]]]", () => {
      // parser.write('[[[1');
      // parser.write(']]]');
    });

    it("character by character: [ + [ + [ + 1 + ] + ] + ]", () => {
      // parser.write('[');
      // parser.write('[');
      // parser.write('[');
      // parser.write('1');
      // parser.write(']');
      // parser.write(']');
      // parser.write(']');
    });
  });

  describe("Whitespace Chunks", () => {
    it("spaces around elements: [ +   + 1 +   + , +   + 2 +   + ]", () => {
      // parser.write('[');
      // parser.write('  ');
      // parser.write('1');
      // parser.write('  ');
      // parser.write(',');
      // parser.write('  ');
      // parser.write('2');
      // parser.write('  ');
      // parser.write(']');
    });

    it("newlines and tabs: [ + \\n + 1 + \\t + , + \\n + 2 + \\n + ]", () => {
      // parser.write('[');
      // parser.write('\n');
      // parser.write('1');
      // parser.write('\t');
      // parser.write(',');
      // parser.write('\n');
      // parser.write('2');
      // parser.write('\n');
      // parser.write(']');
    });
  });

  describe("Large Array Chunks", () => {
    it("many elements with splits", () => {
      // parser.write('[1,2,3,4,5,');
      // parser.write('6,7,8,9,10]');
    });

    it("long string element split", () => {
      const longString = "a".repeat(100);
      // parser.write('["');
      // parser.write(longString.slice(0, 50));
      // parser.write(longString.slice(50));
      // parser.write('"]');
    });

    it("character by character for many elements", () => {
      const chars = "[1,2,3,4,5]";
      for (const char of chars) {
        // parser.write(char);
      }
    });
  });
});
