import { beforeEach, describe, expect, it } from "vitest";

describe("Object Parsing", () => {
  const values =
    '{"false":false,"true":true,"null":null,"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5,"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u0041","empty_object":{},"empty_array":[]}';
  const nestedValues =
    '{"primitives":{"false":false,"true":true,"null":null},"numbers":{"zero":0,"integer":42,"negative_integer":-17,"float":3.14159,"negative_float":-0.001,"scientific_positive":1.23e10,"scientific_negative":-4.56E-7,"scientific_plus":1e+5},"strings":{"string":"Hello World","empty_string":"","escaped_quote": "\\"","escaped_backslash": "\\\\", "escaped_forwardslash": "\\/", "escaped_backspace": "\\b", "escaped_formfeed": "\\f", "escaped_newline": "\\n", "escaped_carriagereturn": "\\r", "escaped_tab": "\\t", "escaped_unicode": "\\u0041"},"containers":{"empty_object":{},"empty_array":[],"level2":[{"level4": {"null": null, "false": false, "true": true, "meaning_of_life": 42, "string": "deep thought"}}]}}';
});
