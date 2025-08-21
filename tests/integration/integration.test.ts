import { describe, expect, it } from "vitest";
import { parseStream } from "~/index";

class StructureBuilder {
  // biome-ignore lint/suspicious/noExplicitAny: JSON \/*.*\/
  private root: any = null;

  set(path: Array<string | number>, value: string): void {
    if (this.root === null) {
      this.root = typeof path[0] === "number" ? [] : {};
    }

    let curr = this.root;

    for (let i = 0; i < path.length; i += 1) {
      const key = path[i];
      const isLast = i === path.length - 1;
      const nextKey = path[i + 1];

      if (isLast) {
        // Leaf: concatenate JSON value
        if (curr[key] === undefined) {
          curr[key] = "";
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

  getStructure() {
    return this.root;
  }
}

describe.for([
  [
    '{"false":false,"true":true,"null":null,"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5,"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u2764","empty_object":{},"empty_array":[]}',
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
    '{"primitives":{"false":false,"true":true,"null":null},"numbers":{"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5},"strings":{"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u2764"},"containers":{"empty_object":{},"empty_array":[],"level2":[{"level4": {"null": null, "false": false, "true": true, "meaning_of_life": 42, "string": "deep thought"}}]}}',
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
  [
    '[false,null,true,0,42,-17,3.14159,-0.001,1.23e10,-4.56E-7,1e+5,"Hello World","","\\"","\\\\","\\/","\\b","\\f","\\n","\\r","\\t","\\u0041",{},[]]',
    [
      "false",
      "null",
      "true",
      "0",
      "42",
      "-17",
      "3.14159",
      "-0.001",
      "1.23e10",
      "-4.56E-7",
      "1e+5",
      "Hello World",
      undefined,
      '"',
      "\\",
      "/",
      "\b",
      "\f",
      "\n",
      "\r",
      "\t",
      "\u0041",
    ],
  ],
  [
    '[[false,null,true],[0,42,-17,3.14159,-0.001,1.23e10,-4.56E-7,1e+5],["Hello World","","\\"","\\\\","\\/","\\b","\\f","\\n","\\r","\\t","\\u0041"],[{},[],[{"level4":[null,false,true,42,"deep thought"]},[]]]]',
    [
      ["false", "null", "true"],
      ["0", "42", "-17", "3.14159", "-0.001", "1.23e10", "-4.56E-7", "1e+5"],
      [
        "Hello World",
        undefined,
        '"',
        "\\",
        "/",
        "\b",
        "\f",
        "\n",
        "\r",
        "\t",
        "\u0041",
      ],
      [
        undefined,
        undefined,
        [{ level4: ["null", "false", "true", "42", "deep thought"] }],
      ],
    ],
  ],
])("objects", ([json, expected]) => {
  const variants = [];
  const jsonString = json as string;
  for (let chunkSize = 0; chunkSize < jsonString.length + 1; chunkSize += 1) {
    // split into two chunks based on chunk size
    variants.push([
      jsonString.slice(0, chunkSize),
      jsonString.slice(chunkSize),
    ]);
    if (chunkSize === 0) {
      continue;
    }
    // split into n chunks based on chunk size
    const numberOfChunks = Math.ceil(jsonString.length / chunkSize);
    if (numberOfChunks === 1 || numberOfChunks === 2) {
      continue;
    }
    const chunks = [];
    for (let i = 0; i < numberOfChunks; i += 1) {
      chunks.push(jsonString.slice(i * chunkSize, (i + 1) * chunkSize));
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
