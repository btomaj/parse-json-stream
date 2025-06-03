import { beforeEach, describe, expect, it } from "vitest";

describe("Number Parsing", () => {
  const numbers = [
    "0",
    "42",
    "-17",
    "3.14",
    "-0.001",
    "1.23e10",
    "-4.56e-7",
    "1e+5",
  ];

  describe.for(numbers)("should parse %s", (number) => {
    const splits = [];
    for (let chunkSize = 0; chunkSize < number.length + 1; chunkSize++) {
      // split into two chunks based on chunk size
      splits.push([number.slice(0, chunkSize), number.slice(chunkSize)]);
      if (chunkSize === 0) {
        continue;
      }
      // split into n chunks based on chunk size
      const numberOfChunks = Math.ceil(number.length / chunkSize);
      if (numberOfChunks === 1 || numberOfChunks === 2) {
        continue;
      }
      const chunks = [];
      for (let i = 0; i < numberOfChunks; i += 1) {
        chunks.push(number.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      splits.push(chunks);
    }
    console.log(splits);
    it.for(splits)("split into chunks #%#", (split) => {
      // parser.write(String(nuber));
    });
  });
});
