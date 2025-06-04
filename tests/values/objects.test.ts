import { beforeEach, describe, expect, it } from "vitest";

describe("Object Parsing", () => {
  describe("should parse flat objects", () => {
    const flatObject =
      '{"false":false,"true":true,"null":null,"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5,"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u0041","empty_object":{},"empty_array":[]}';
    const variants = [];
    for (let chunkSize = 0; chunkSize < flatObject.length + 1; chunkSize++) {
      // split into two chunks based on chunk size
      variants.push({
        chunks: [flatObject.slice(0, chunkSize), flatObject.slice(chunkSize)],
      });
      if (chunkSize === 0) {
        continue;
      }
      // split into n chunks based on chunk size
      const numberOfChunks = Math.ceil(flatObject.length / chunkSize);
      if (numberOfChunks === 1 || numberOfChunks === 2) {
        continue;
      }
      const chunks = [];
      for (let i = 0; i < numberOfChunks; i += 1) {
        chunks.push(flatObject.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      variants.push({ chunks });
    }
    it.for(variants)("split into $chunks", () => {});
  });

  describe("should parse deep objects", () => {
    const deepObject =
      '{"primitives":{"false":false,"true":true,"null":null},"numbers":{"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5},"strings":{"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u0041"},"containers":{"empty_object":{},"empty_array":[],"level2":[{"level4": {"null": null, "false": false, "true": true, "meaning_of_life": 42, "string": "deep thought"}}]}}';
    const variants = [];
    for (let chunkSize = 0; chunkSize < deepObject.length + 1; chunkSize++) {
      // split into two chunks based on chunk size
      variants.push({
        chunks: [deepObject.slice(0, chunkSize), deepObject.slice(chunkSize)],
      });
      if (chunkSize === 0) {
        continue;
      }
      // split into n chunks based on chunk size
      const numberOfChunks = Math.ceil(deepObject.length / chunkSize);
      if (numberOfChunks === 1 || numberOfChunks === 2) {
        continue;
      }
      const chunks = [];
      for (let i = 0; i < numberOfChunks; i += 1) {
        chunks.push(deepObject.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      variants.push({ chunks });
    }
    it.for(variants)("split into $chunks", () => {});
  });
});
