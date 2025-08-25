import type { JSONValue } from "~/lib/domain/lexer";

/**
 * Represents a chunk of a JSON value with metadata about its type, position
 * within the JSON structure.
 *
 * A JSONChunk contains a slice of the original JSON buffer along with
 * contextual information including the JSON pointer path, JSONPath expression,
 * and value type. It provides efficient access to JSON fragments during
 * streaming parse operations.
 *
 * @example
 * ```typescript
 * const chunk = new JSONChunk(
 *   '{"name": "John", "age": 30}',
 *   8,
 *   14,
 *   JSONValue.String,
 *   ["name"]
 * );
 * console.log(chunk.value);   // "John"
 * console.log(chunk.path);    // "$.name"
 * console.log(chunk.pointer); // "/name"
 * ```
 */
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

  /**
   * Creates a new JSONChunk instance.
   *
   * @param _buffer The complete JSON string buffer containing this chunk
   * @param _start The 0-based starting index of this chunk within the buffer (inclusive)
   * @param _end The 0-based ending index of this chunk within the buffer (exclusive)
   * @param _type The JSON value type of this chunk
   * @param _segments Array of path segments (strings for object keys, numbers for array indices)
   */
  constructor(
    private readonly _buffer: string,
    private readonly _start: number,
    private readonly _end: number,
    private readonly _type: JSONValue,
    private readonly _segments: ReadonlyArray<string | number>,
  ) {}

  /**
   * Gets the JSON value represented by this JSONChunk as a string.
   *
   * @returns The substring from the buffer corresponding to this chunk's boundaries
   */
  get value(): string {
    return this._buffer.slice(this._start, this._end);
  }

  /**
   * Gets the type of the JSON primitive represented by this JSONChunk.
   *
   * @returns The string, number, boolean, or null
   */
  get type(): JSONValue {
    return this._type;
  }

  /**
   * Gets the JSON Pointer (RFC 6901) for the position in the JSON structure of
   * the value represented by this JSONChunk.
   *
   * @returns A JSON Pointer string (e.g., "/users/0/name")
   * @example
   * ```typescript
   * // For path ["users", 0, "name"]
   * chunk.pointer; // "/users/0/name"
   *
   * // For root
   * chunk.pointer; // "/"
   *
   * // For path with special characters ["key~with/slash"]
   * chunk.pointer; // "/key~0with~1slash"
   * ```
   */
  get pointer(): string {
    const segments = this._segments;
    const len = segments.length;
    if (len === 0) {
      return "/";
    }

    let result = "";
    for (let i = 0; i < len; i += 1) {
      result += "/";
      const segment = String(segments[i]);
      for (let j = 0; j < segment.length; j += 1) {
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

  /**
   * Gets the JSONPath for the position in the JSON structure of the value
   * represented by this JSONChunk
   *
   * @returns A JSONPath string (e.g., "$.users[0].name")
   * @example
   * ```typescript
   * // For path ["users", 0, "name"]
   * chunk.path; // "$.users[0].name"
   *
   * // For root
   * chunk.path; // "$"
   *
   * // For path with special characters ["user name", "first-name"]
   * chunk.path; // "$['user name']['first-name']"
   *
   * // For numeric string key ["123"]
   * chunk.path; // "$['123']"
   * ```
   */
  get path(): string {
    const segments = this._segments;
    const len = segments.length;
    if (len === 0) {
      return "$";
    }

    let result = "$";
    for (let i = 0; i < len; i += 1) {
      const segment = segments[i];
      if (typeof segment === "number") {
        result += `[${segment}]`;
      } else {
        if (this.needsBracketNotation(segment)) {
          result += "['";
          const segLen = segment.length;
          for (let j = 0; j < segLen; j += 1) {
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

  /**
   * Helper method to determine if a property name requires bracket notation in
   * a JSONPath.
   *
   * Properties need bracket notation if they:
   * - Are empty strings
   * - Start with $ or @ (JSONPath reserved characters)
   * - Are purely numeric (would be confused with array indices)
   * - Contain special characters (spaces, punctuation, control characters)
   *
   * @param property The property name to check
   * @returns True if the property requires bracket notation, false otherwise
   * @private
   */
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
    for (let i = 0; i < len; i += 1) {
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
    for (let i = 0; i < len; i += 1) {
      const code = property.charCodeAt(i);
      if (code < 32 || code > 126 || JSONChunk.SPECIAL_CHARS_BITMAP[code]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets a copy of the path segments array.
   *
   * The segments represent the path from the root to this chunk, where:
   * - String segments represent object property keys
   * - Number segments represent array indices
   *
   * @returns A new array containing the path segments
   * @example
   * ```typescript
   * // For JSON: {"users": [{"name": "John"}]}
   * // A chunk at "John" would have segments: ["users", 0, "name"]
   * ```
   */
  get segments(): Array<string | number> {
    return [...this._segments];
  }
}
