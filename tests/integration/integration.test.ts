import { describe, expect, it } from "vitest";
import { parseStream } from "~/index";

describe.for([
  [
    '{"false":false,"true":true,"null":null,"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5,"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u2764","empty_object":{},"empty_array":[]}',
    [
      [["false"], "false"],
      [["true"], "true"],
      [["null"], "null"],
      [["zero"], "0"],
      [["integer"], "42"],
      [["negative_integer"], "-17"],
      [["float"], "3.14159"],
      [["negative_float"], "-0.001"],
      [["scientific_positive"], "1.23e10"],
      [["scientific_negative"], "-4.56E-7"],
      [["scientific_plus"], "1e+5"],
      [["string"], "Hello World"],
      [["escaped_quote"], '"'],
      [["escaped_backslash"], "\\"],
      [["escaped_forwardslash"], "/"],
      [["escaped_backspace"], "\b"],
      [["escaped_formfeed"], "\f"],
      [["escaped_newline"], "\n"],
      [["escaped_carriagereturn"], "\r"],
      [["escaped_tab"], "\t"],
      [["escaped_unicode"], "\u2764"],
    ],
  ],
  [
    '{"primitives":{"true":true,"false":false,"null":null},"numbers":{"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5},"strings":{"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u2764"},"containers":{"empty_object":{},"empty_array":[],"level2":[{"level4": {"null": null, "false": false, "true": true, "meaning_of_life": 42, "string": "deep thought"}}]}}',
    [
      [["primitives", "true"], "true"],
      [["primitives", "false"], "false"],
      [["primitives", "null"], "null"],
      [["numbers", "zero"], "0"],
      [["numbers", "integer"], "42"],
      [["numbers", "negative_integer"], "-17"],
      [["numbers", "float"], "3.14159"],
      [["numbers", "negative_float"], "-0.001"],
      [["numbers", "scientific_positive"], "1.23e10"],
      [["numbers", "scientific_negative"], "-4.56E-7"],
      [["numbers", "scientific_plus"], "1e+5"],
      [["strings", "string"], "Hello World"],
      [["strings", "escaped_quote"], '"'],
      [["strings", "escaped_backslash"], "\\"],
      [["strings", "escaped_forwardslash"], "/"],
      [["strings", "escaped_backspace"], "\b"],
      [["strings", "escaped_formfeed"], "\f"],
      [["strings", "escaped_newline"], "\n"],
      [["strings", "escaped_carriagereturn"], "\r"],
      [["strings", "escaped_tab"], "\t"],
      [["strings", "escaped_unicode"], "\u2764"],
      [["containers", "level2", 0, "level4", "null"], "null"],
      [["containers", "level2", 0, "level4", "false"], "false"],
      [["containers", "level2", 0, "level4", "true"], "true"],
      [["containers", "level2", 0, "level4", "meaning_of_life"], "42"],
      [["containers", "level2", 0, "level4", "string"], "deep thought"],
    ],
  ],
  [
    '[false,null,true,0,42,-17,3.14159,-0.001,1.23e10,-4.56E-7,1e+5,"Hello World","","\\"","\\\\","\\/","\\b","\\f","\\n","\\r","\\t","\\u0041",{},[]]',
    [
      [[0], "false"],
      [[1], "null"],
      [[2], "true"],
      [[3], "0"],
      [[4], "42"],
      [[5], "-17"],
      [[6], "3.14159"],
      [[7], "-0.001"],
      [[8], "1.23e10"],
      [[9], "-4.56E-7"],
      [[10], "1e+5"],
      [[11], "Hello World"],
      [[13], '"'],
      [[14], "\\"],
      [[15], "/"],
      [[16], "\b"],
      [[17], "\f"],
      [[18], "\n"],
      [[19], "\r"],
      [[20], "\t"],
      [[21], "\u0041"],
    ],
  ],
  [
    '[[false,null,true],[0,42,-17,3.14159,-0.001,1.23e10,-4.56E-7,1e+5],["Hello World","","\\"","\\\\","\\/","\\b","\\f","\\n","\\r","\\t","\\u0041"],[{},[],[{"level4":[null,false,true,42,"deep thought"]},[]]]]',
    [
      [[0, 0], "false"],
      [[0, 1], "null"],
      [[0, 2], "true"],
      [[1, 0], "0"],
      [[1, 1], "42"],
      [[1, 2], "-17"],
      [[1, 3], "3.14159"],
      [[1, 4], "-0.001"],
      [[1, 5], "1.23e10"],
      [[1, 6], "-4.56E-7"],
      [[1, 7], "1e+5"],
      [[2, 0], "Hello World"],
      [[2, 2], '"'],
      [[2, 3], "\\"],
      [[2, 4], "/"],
      [[2, 5], "\b"],
      [[2, 6], "\f"],
      [[2, 7], "\n"],
      [[2, 8], "\r"],
      [[2, 9], "\t"],
      [[2, 10], "\u0041"],
      [[3, 2, 0, "level4", 0], "null"],
      [[3, 2, 0, "level4", 1], "false"],
      [[3, 2, 0, "level4", 2], "true"],
      [[3, 2, 0, "level4", 3], "42"],
      [[3, 2, 0, "level4", 4], "deep thought"],
    ],
  ],
])("parseStream should parse JSON values", ([json, expected]) => {
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

  it.for(variants)(
    "for chunk variation #%$ from ReadableStream",
    async (variant) => {
      // Arrange
      const readableStream = new ReadableStream({
        start(controller) {
          for (const chunk of variant) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
      const jsonChunks = parseStream(readableStream);
      const chunks = new Map<
        string,
        { segments: Array<string | number>; value: string }
      >();

      // Act
      for await (const chunk of jsonChunks) {
        const segments = JSON.stringify(chunk.segments);
        if (chunks.has(segments)) {
          // biome-ignore lint/style/noNonNullAssertion: guarded by if statment
          chunks.get(segments)!.value += chunk.value;
        } else {
          chunks.set(segments, {
            segments: chunk.segments,
            value: chunk.value,
          });
        }
      }

      // Assert
      expect(
        Array.from(chunks.values(), ({ segments, value }) => [segments, value]),
      ).toEqual(expected);
    },
  );

  it.for(variants)(
    "for chunk variation #%$ from AsyncIterable",
    async (variant) => {
      // Arrange
      async function* asyncIterable() {
        for (const chunk of variant) {
          yield chunk;
        }
      }
      const jsonChunks = parseStream(asyncIterable());
      const chunks = new Map<
        string,
        { segments: Array<string | number>; value: string }
      >();

      // Act
      for await (const chunk of jsonChunks) {
        const segments = JSON.stringify(chunk.segments);
        if (chunks.has(segments)) {
          // biome-ignore lint/style/noNonNullAssertion: guarded by if statment
          chunks.get(segments)!.value += chunk.value;
        } else {
          chunks.set(segments, {
            segments: chunk.segments,
            value: chunk.value,
          });
        }
      }

      // Assert
      expect(
        Array.from(chunks.values(), ({ segments, value }) => [segments, value]),
      ).toEqual(expected);
    },
  );

  // cannot test WebSockets, nor EventSource
  it.skip("for chunk variation #%$ from WebSocket");
  it.skip("for chunk variation #%$ from EventSource");
});
