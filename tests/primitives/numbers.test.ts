import { beforeEach, describe, expect, it } from "vitest";

describe("Number Parsing", () => {
  let parser: any;
  let events: any[];

  beforeEach(() => {
    events = [];
    // parser = new JsonStreamParser();
    // parser.on('value', (chunk) => events.push({ type: 'value', data: chunk }));
  });

  describe("Integer Chunks", () => {
    it("single chunk: 123", () => {
      // parser.write('123');
    });

    it("character by character: 1 + 2 + 3", () => {
      // parser.write('1');
      // parser.write('2');
      // parser.write('3');
    });

    it("split middle: 12 + 3", () => {
      // parser.write('12');
      // parser.write('3');
    });

    it("split middle: 1 + 23", () => {
      // parser.write('1');
      // parser.write('23');
    });
  });

  describe("Negative Integer Chunks", () => {
    it("single chunk: -123", () => {
      // parser.write('-123');
    });

    it("split at minus: - + 123", () => {
      // parser.write('-');
      // parser.write('123');
    });

    it("split after minus: -1 + 23", () => {
      // parser.write('-1');
      // parser.write('23');
    });

    it("character by character: - + 1 + 2 + 3", () => {
      // parser.write('-');
      // parser.write('1');
      // parser.write('2');
      // parser.write('3');
    });
  });

  describe("Decimal Chunks", () => {
    it("single chunk: 12.34", () => {
      // parser.write('12.34');
    });

    it("split at dot: 12 + .34", () => {
      // parser.write('12');
      // parser.write('.34');
    });

    it("split after dot: 12. + 34", () => {
      // parser.write('12.');
      // parser.write('34');
    });

    it("character by character: 1 + 2 + . + 3 + 4", () => {
      // parser.write('1');
      // parser.write('2');
      // parser.write('.');
      // parser.write('3');
      // parser.write('4');
    });

    it("split before dot: 1 + 2.34", () => {
      // parser.write('1');
      // parser.write('2.34');
    });
  });

  describe("Scientific Notation Chunks", () => {
    it("single chunk: 1.23e10", () => {
      // parser.write('1.23e10');
    });

    it("split at e: 1.23 + e10", () => {
      // parser.write('1.23');
      // parser.write('e10');
    });

    it("split after e: 1.23e + 10", () => {
      // parser.write('1.23e');
      // parser.write('10');
    });

    it("character by character: 1 + . + 2 + 3 + e + 1 + 0", () => {
      // parser.write('1');
      // parser.write('.');
      // parser.write('2');
      // parser.write('3');
      // parser.write('e');
      // parser.write('1');
      // parser.write('0');
    });

    it("uppercase E split: 1.23 + E10", () => {
      // parser.write('1.23');
      // parser.write('E10');
    });
  });

  describe("Scientific with Sign Chunks", () => {
    it("positive exponent split: 1e + +5", () => {
      // parser.write('1e');
      // parser.write('+5');
    });

    it("negative exponent split: 1e + -5", () => {
      // parser.write('1e');
      // parser.write('-5');
    });

    it("split after sign: 1e+ + 5", () => {
      // parser.write('1e+');
      // parser.write('5');
    });

    it("split after sign: 1e- + 5", () => {
      // parser.write('1e-');
      // parser.write('5');
    });
  });

  describe("Zero Chunks", () => {
    it("single chunk: 0", () => {
      // parser.write('0');
    });

    it("zero decimal: 0 + .123", () => {
      // parser.write('0');
      // parser.write('.123');
    });

    it("zero decimal: 0. + 123", () => {
      // parser.write('0.');
      // parser.write('123');
    });
  });

  describe("Large Number Chunks", () => {
    it("many digits split: 123456 + 789", () => {
      // parser.write('123456');
      // parser.write('789');
    });

    it("very small chunks throughout: 1 + 2 + 3 + . + 4 + 5 + e + - + 1 + 0", () => {
      // parser.write('1');
      // parser.write('2');
      // parser.write('3');
      // parser.write('.');
      // parser.write('4');
      // parser.write('5');
      // parser.write('e');
      // parser.write('-');
      // parser.write('1');
      // parser.write('0');
    });
  });
});
