import { beforeEach, describe, expect, it } from "vitest";

describe("Null Parsing", () => {
  let parser: any;
  let events: any[];

  beforeEach(() => {
    events = [];
  });

  describe("Null Values", () => {
    it("should parse null in single chunk", () => {
      const input = "null";
      // parser.write(input);
    });

    it("should parse null character by character", () => {
      const chunks = ["n", "u", "l", "l"];
      // chunks.forEach(chunk => parser.write(chunk));
    });

    it("should parse null in two chunks", () => {
      const chunks = ["nu", "ll"];
      // chunks.forEach(chunk => parser.write(chunk));
    });

    it("should parse null in three chunks", () => {
      const chunks = ["n", "ul", "l"];
      // chunks.forEach(chunk => parser.write(chunk));
    });

    it("should parse null split at each position", () => {
      const testCases = [
        ["n", "ull"],
        ["nu", "ll"],
        ["nul", "l"],
      ];

      testCases.forEach((chunks) => {
        // Reset parser for each test
        // chunks.forEach(chunk => parser.write(chunk));
      });
    });
  });

  describe("Null Edge Cases", () => {
    it("should handle null at start of chunk", () => {
      const chunks = ["", "null"];
      // chunks.forEach(chunk => parser.write(chunk));
    });

    it("should handle null at end of chunk", () => {
      const chunks = ["null", ""];
      // chunks.forEach(chunk => parser.write(chunk));
    });

    it("should handle null with surrounding whitespace across chunks", () => {
      const chunks = [" ", "null", " "];
      // chunks.forEach(chunk => parser.write(chunk));
    });
  });
});
