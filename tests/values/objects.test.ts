import { describe, expect, it } from "vitest";
import { parseStream } from "~/index";

const flatObject =
  '{"false":false,"true":true,"null":null,"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5,"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u0041","empty_object":{},"empty_array":[]}';
const deepObject =
  '{"primitives":{"false":false,"true":true,"null":null},"numbers":{"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5},"strings":{"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u0041"},"containers":{"empty_object":{},"empty_array":[],"level2":[{"level4": {"null": null, "false": false, "true": true, "meaning_of_life": 42, "string": "deep thought"}}]}}';

class StructureBuilder {
  private root: any = null;

  set(path: Array<string | number>, value: string): void {
    if (this.root === null) {
      this.root = typeof path[0] === "number" ? [] : {};
    }

    let curr: any = this.root;

    for (let i = 0; i < path.length; i += 1) {
      const key = path[i];
      const isLast = i === path.length - 1;

      if (isLast) {
        if (curr[key] === undefined) {
          curr[key] = "";
        }
        curr[key] += value;
      } else {
        const nextKey = path[i + 1];
        const shouldBeArray = typeof nextKey === "number";

        if (!(key in curr)) {
          curr[key] = shouldBeArray ? [] : {};
        }

        curr = curr[key];
      }
    }
  }

  getStructure(): any {
    return this.root;
  }
}

describe("flat objects", () => {
  const variants = [];
  for (let chunkSize = 0; chunkSize < object.length + 1; chunkSize += 1) {
    // split into two chunks based on chunk size
    variants.push([
      flatObject.slice(0, chunkSize),
      flatObject.slice(chunkSize),
    ]);
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
    variants.push(chunks);
  }
  describe.for(variants)("split into %o", (variant) => {
    it("should ", async () => {
      const readableStream = new ReadableStream({
        start(controller) {
          for (const chunk of variant) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
      const builder = new StructureBuilder();
      const jsonChunks = parseStream(readableStream);

      for await (const chunk of jsonChunks) {
        builder.set(chunk.segments, chunk.value);
      }

      expect(builder.getStructure()).toEqual({
        escaped_backslash: "\\\\",
        escaped_backspace: "\\b",
        escaped_carriagereturn: "\\r",
        escaped_formfeed: "\\f",
        escaped_forwardslash: "\\/",
        escaped_newline: "\\n",
        escaped_quote: '\\"',
        escaped_tab: "\\t",
        escaped_unicode: "\\u0041",
        false: "false",
        float: "3.14159",
        integer: "42",
        negative_float: "-0.001",
        negative_integer: "-17",
        null: "null",
        scientific_negative: "-4.56E-7",
        scientific_plus: "1e+5",
        scientific_positive: "1.23e10",
        string: "Hello World",
        true: "true",
        zero: "0",
      });
    });
  });
});

describe("nested objects", () => {
  const variants = [];
  for (let chunkSize = 0; chunkSize < deepObject.length + 1; chunkSize++) {
    // split into two chunks based on chunk size
    variants.push([
      deepObject.slice(0, chunkSize),
      deepObject.slice(chunkSize),
    ]);
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
    variants.push(chunks);
  }
  it.for(variants)("split into chunks", () => {});
});
