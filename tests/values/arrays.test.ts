import { beforeEach, describe, expect, it } from "vitest";

describe("Array Parsing", () => {
  describe("should parse flat arrays", () => {
    const flatArray =
      '[false,null,true,0,42,-17,3.14159,-0.001,1.23e10,-4.56E-7,1e+5,"Hello World","","\\"","\\\\","/","\\b","\\f","\\n","\\r","\\t","\u0041",{},[]]';
    const variants = [];
    for (let chunkSize = 0; chunkSize < flatArray.length + 1; chunkSize++) {
      // split into two chunks based on chunk size
      variants.push({
        chunks: [flatArray.slice(0, chunkSize), flatArray.slice(chunkSize)],
      });
      if (chunkSize === 0) {
        continue;
      }
      // split into n chunks based on chunk size
      const numberOfChunks = Math.ceil(flatArray.length / chunkSize);
      if (numberOfChunks === 1 || numberOfChunks === 2) {
        continue;
      }
      const chunks = [];
      for (let i = 0; i < numberOfChunks; i += 1) {
        chunks.push(flatArray.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      variants.push({ chunks });
    }
    it.for(variants)("split into $chunks", () => {});
  });

  describe("should parse nested arrays", () => {
    const nestedArray =
      '[[false,null,true],[0,42,-17,3.14159,-0.001,1.23e10,-4.56E-7,1e+5],["Hello World","","\\"","\\\\","/","\\b","\\f","\\n","\\r","\\t","\u0041"],[{},[],[{"level4":[null,false,true,42,"deep thought"]},[]]]]';
    const variants = [];
    for (let chunkSize = 0; chunkSize < nestedArray.length + 1; chunkSize++) {
      // split into two chunks based on chunk size
      variants.push({
        chunks: [nestedArray.slice(0, chunkSize), nestedArray.slice(chunkSize)],
      });
      if (chunkSize === 0) {
        continue;
      }
      // split into n chunks based on chunk size
      const numberOfChunks = Math.ceil(nestedArray.length / chunkSize);
      if (numberOfChunks === 1 || numberOfChunks === 2) {
        continue;
      }
      const chunks = [];
      for (let i = 0; i < numberOfChunks; i += 1) {
        chunks.push(nestedArray.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      variants.push({ chunks });
    }
    it.for(variants)("split into $chunks", () => {});
  });
});
