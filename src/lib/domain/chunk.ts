import type { JSONValue } from "./lexer";

export class JSONChunk {
  private static readonly SPECIAL_CHARS_BITMAP = new Uint8Array([
    // 0-31: Control characters
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    // 32-47: Special punctuation
    1, // 32: space
    1, // 33: !
    1, // 34: "
    1, // 35: #
    0, // 36: $ (handled separately)
    1, // 37: %
    1, // 38: &
    1, // 39: '
    1, // 40: (
    1, // 41: )
    1, // 42: *
    1, // 43: +
    1, // 44: ,
    1, // 45: -
    1, // 46: .
    1, // 47: /
    // 48-57: Digits 0-9
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    // 58-63: More punctuation
    1, // 58: :
    1, // 59: ;
    1, // 60: <
    1, // 61: =
    1, // 62: >
    1, // 63: ?
    // 64: @ (handled separately)
    0,
    // 65-90: A-Z
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    // 91-96: Brackets and symbols
    1, // 91: [
    1, // 92: \
    1, // 93: ]
    1, // 94: ^
    0, // 95: _
    0, // 96: `
    // 97-122: a-z
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    // 123-127: Closing braces and symbols
    1, // 123: {
    1, // 124: |
    1, // 125: }
    1, // 126: ~
    0, // 127: DEL
  ]);

  constructor(
    private readonly _value: string,
    private readonly _type: JSONValue,
    private readonly _segments: ReadonlyArray<string | number>,
  ) {}

  get value(): string {
    return this._value;
  }

  get type(): JSONValue {
    return this._type;
  }

  get pointer(): string {
    const segments = this._segments;
    const len = segments.length;
    if (len === 0) {
      return "/";
    }

    let result = "";
    for (let i = 0; i < len; i++) {
      result += "/";
      const segment = String(segments[i]);
      for (let j = 0; j < segment.length; j++) {
        const code = segment.charCodeAt(j);
        if (code === 126) {
          result += "~0";
        } else if (code === 47) {
          result += "~1";
        } else {
          result += segment[j];
        }
      }
    }
    return result;
  }

  get path(): string {
    const segments = this._segments;
    const len = segments.length;
    if (len === 0) {
      return "$";
    }

    let result = "$";
    for (let i = 0; i < len; i++) {
      const segment = segments[i];
      if (typeof segment === "number") {
        result += `[${segment}]`;
      } else {
        if (this.needsBracketNotation(segment)) {
          result += "['";
          const segLen = segment.length;
          for (let j = 0; j < segLen; j++) {
            const code = segment.charCodeAt(j);
            if (code === 92) {
              result += "\\\\";
            } else if (code === 39) {
              result += "\\'";
            } else {
              result += segment[j];
            }
          }
          result += "']";
        } else {
          result += `.${segment}`;
        }
      }
    }
    return result;
  }

  private needsBracketNotation(property: string): boolean {
    const len = property.length;
    if (len === 0) {
      return true;
    }

    const firstChar = property.charCodeAt(0);
    if (firstChar === 36 || firstChar === 64) {
      return true; // $ or @
    }

    // Fast path: check if purely numeric
    let isNumeric = true;
    for (let i = 0; i < len; i++) {
      const code = property.charCodeAt(i);
      if (code < 48 || code > 57) {
        isNumeric = false;
        break;
      }
    }
    if (isNumeric) {
      return true;
    }

    // Check for special characters using bitmap lookup
    for (let i = 0; i < len; i++) {
      const code = property.charCodeAt(i);
      if (code < 32 || code > 126 || JSONChunk.SPECIAL_CHARS_BITMAP[code]) {
        return true;
      }
    }
    return false;
  }

  get segments(): Array<string | number> {
    return [...this._segments];
  }
}
