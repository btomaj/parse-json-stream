import { beforeEach, describe, expect, it } from "vitest";

describe("String Parsing", () => {
  const strings = [
    "Hello World",
    "",
    '\\"',
    "\\\\",
    "\\/",
    "\\b",
    "\\f",
    "\\n",
    "\\r",
    "\\t",
    "\\u0041",
  ];

  describe.for(strings)("should parse %s", (string) => {
    const splits = [];
    for (let chunkSize = 0; chunkSize < string.length + 1; chunkSize++) {
      // split into two chunks based on chunk size
      splits.push([string.slice(0, chunkSize), string.slice(chunkSize)]);
      if (chunkSize === 0) {
        continue;
      }
      // split into n chunks based on chunk size
      const numberOfChunks = Math.ceil(string.length / chunkSize);
      if (numberOfChunks === 1 || numberOfChunks === 2) {
        continue;
      }
      const chunks = [];
      for (let i = 0; i < numberOfChunks; i += 1) {
        chunks.push(string.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      splits.push(chunks);
    }
    console.log(splits);
    it.for(splits)("split into chunks #%#", (split) => {
      // parser.write(String(nuber));
    });
  });
});
