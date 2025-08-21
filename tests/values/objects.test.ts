import { describe, expect, it } from "vitest";
import { parseStream } from "~/index";

const flatObject =
  '{"false":false,"true":true,"null":null,"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5,"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u2764","empty_object":{},"empty_array":[]}';
const deepObject =
  '{"primitives":{"false":false,"true":true,"null":null},"numbers":{"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5},"strings":{"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u2764"},"containers":{"empty_object":{},"empty_array":[],"level2":[{"level4": {"null": null, "false": false, "true": true, "meaning_of_life": 42, "string": "deep thought"}}]}}';

class StructureBuilder {
  private root: any = {};

  set(path: Array<string | number>, value: string): void {
    let curr = this.root;

    for (let i = 0; i < path.length; i += 1) {
      const key = path[i];
      const isLast = i === path.length - 1;
      const nextKey = path[i + 1];

      if (isLast) {
        // Leaf: parse JSON value instead of concatenating strings
        if (curr[key] === undefined) {
          curr[key] = "";
          //   curr[key] = this.parseJSONValue(value);
          // } else {
          //   // If key already exists, concatenate as string (for chunked values)
          //   if (typeof curr[key] !== "string") {
          //     curr[key] = String(curr[key]);
          //   }
          //   curr[key] += value;
        }
        curr[key] += value;
      } else {
        // Non-leaf: create container if missing
        if (curr[key] === undefined) {
          curr[key] = typeof nextKey === "number" ? [] : {};
        } else if (typeof nextKey === "number" && !Array.isArray(curr[key])) {
          curr[key] = [];
        } else if (
          typeof nextKey !== "number" &&
          typeof curr[key] !== "object"
        ) {
          curr[key] = {};
        }

        curr = curr[key];
      }
    }
  }

  getStructure(): any {
    return this.root;
  }
}

describe.for([
  [
    flatObject,
    {
      escaped_backslash: "\\",
      escaped_backspace: "\b",
      escaped_carriagereturn: "\r",
      escaped_formfeed: "\f",
      escaped_forwardslash: "\/",
      escaped_newline: "\n",
      escaped_quote: '\"',
      escaped_tab: "\t",
      escaped_unicode: "\u2764",
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
    },
  ],
  [
    deepObject,
    {
      strings: {
        string: "Hello World",
        escaped_unicode: "\u2764",
        escaped_backslash: "\\",
        escaped_backspace: "\b",
        escaped_carriagereturn: "\r",
        escaped_formfeed: "\f",
        escaped_forwardslash: "\/",
        escaped_newline: "\n",
        escaped_quote: '\"',
        escaped_tab: "\t",
      },
      numbers: {
        float: "3.14159",
        integer: "42",
        negative_float: "-0.001",
        negative_integer: "-17",
        scientific_negative: "-4.56E-7",
        scientific_plus: "1e+5",
        scientific_positive: "1.23e10",
        zero: "0",
      },
      primitives: {
        true: "true",
        false: "false",
        null: "null",
      },
      containers: {
        level2: [
          {
            level4: {
              null: "null",
              false: "false",
              true: "true",
              meaning_of_life: "42",
              string: "deep thought",
            },
          },
        ],
      },
    },
  ],
])("objects", ([object, expected]) => {
  const variants = [];
  for (let chunkSize = 0; chunkSize < object.length + 1; chunkSize += 1) {
    // split into two chunks based on chunk size
    variants.push([object.slice(0, chunkSize), object.slice(chunkSize)]);
    if (chunkSize === 0) {
      continue;
    }
    // split into n chunks based on chunk size
    const numberOfChunks = Math.ceil(object.length / chunkSize);
    if (numberOfChunks === 1 || numberOfChunks === 2) {
      continue;
    }
    const chunks = [];
    for (let i = 0; i < numberOfChunks; i += 1) {
      chunks.push(object.slice(i * chunkSize, (i + 1) * chunkSize));
    }
    variants.push(chunks);
  }

  describe.for(variants)("split into chunks", (variant) => {
    it("should aggregate to original object", async () => {
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

      expect(builder.getStructure()).toEqual(expected);
    });
  });
});
