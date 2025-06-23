/**
 * Parser passes chunk to Lexer. Lexer returns tokens. Parser parses the tokens;
 * maintaining Object and Array metadata, and returning primitives with
 * metadata. E.g. ["key", 0, "key"], and "string...".
 */
import type { Lexer } from "~/lib/domain/lexer";
import { type DPDA, DPDATransition } from "~/lib/domain/state";

export enum JSONValue {
  Object = "object",
  Array = "array",
  String = "string",
  Number = "number",
  True = "true",
  False = "false",
  Null = "null",
}

/**
 * | Token type   | Delimiter             | Description              |
 * | ------------ | --------------------- | ------------------------ |
 * | `LBRACE`     | `{`                   | Start of an object       |
 * | `RBRACE`     | `}`                   | End of an object         |
 * | `LBRACKET`   | `[`                   | Start of an array        |
 * | `RBRACKET`   | `]`                   | End of an array          |
 * | `COLON`      | `:`                   | Key-value separator      |
 * | `COMMA`      | `,`                   | Member/element separator |
 * | `STRING`     | `"`                   | Start/end of a string    |
 * | `NUMBER`     | `-`, `1`, `2`, etc.   | Integer or float         |
 * | `TRUE`       | `true`                | True literal             |
 * | `FALSE`      | `false`               | False literal            |
 * | `NULL`       | `null`                | Null literal             |
 * | `ESCAPE`     | `\`                   | Escape character         |
 * | `WHITESPACE` | ` `, `\t`, `\n`, `\r` | Whitespace               |
 *
 * @enum {symbol}
 */
export const JSONTokenType = {
  LBrace: Symbol("{"),
  RBrace: Symbol("}"),
  LBracket: Symbol("["),
  RBracket: Symbol("]"),
  Colon: Symbol(":"),
  Comma: Symbol(","),
  String: Symbol('"'),
  Number: Symbol("-0123456789"),
  True: Symbol("t"),
  False: Symbol("f"),
  Null: Symbol("n"),
  Escape: Symbol("\\"),
  Whitespace: Symbol(" \t\n\r"),
} as const;
export type JSONTokenType = (typeof JSONTokenType)[keyof typeof JSONTokenType];

class JSONChunk {
  constructor(
    private _value: string,
    private _type: JSONTokenType,
    private _segments: Array<string | number>,
  ) {}

  get value(): string {
    return this._value;
  }

  get type(): JSONTokenType {
    return this._type;
  }

  public pointer(path: Array<string | number>): string {
    return `/${path
      .map((s) => String(s).replace(/~/g, "~0").replace(/\//g, "~1"))
      .join("/")}`;
  }

  private path(path: Array<string | number>): string {
    return `$${path
      .map((s) => (typeof s === "number" ? `[${s}]` : `.${s}`))
      .join("")}`;
  }

  get segments(): Array<string | number> {
    return [...this._segments];
  }
}

/**
 * A JSON parser that consumes LexerTokens and produces JSONValues. The primary
 * concern of JSONParserUseCase is to maintain nesting metadata from the JSON
 * stream.
 */
export class JSONParserUseCase {
  private lexer: Lexer<typeof JSONTokenType, typeof JSONTokenType>;
  private dpda: DPDA<
    typeof JSONTokenType,
    typeof JSONTokenType,
    typeof JSONValue
  >;
  private path: Array<string | number> = [];

  /**
   * Creates a JSON parser.
   * @param {Lexer} lexer The lexer instance used for tokenization.
   * @param {DPDA} dpda The DPDA instance used for parsing.
   */
  constructor(
    lexer: Lexer<typeof JSONTokenType, typeof JSONTokenType>,
    dpda: DPDA<typeof JSONTokenType, typeof JSONTokenType, typeof JSONValue>,
  ) {
    this.lexer = lexer;
    this.dpda = dpda;
  }

  async *parse(chunk: string): AsyncGenerator<JSONChunk> {
    const tokens = this.lexer.tokenise(chunk);

    // TODO: Manage depth state using dpda
    for await (const token of tokens) {
      if (Object.values(JSONTokenType).includes(token.type)) {
        this.dpda.transition(token.type);
      }
      yield new JSONChunk(token.lexeme, token.type, [...this.path]);
    }
  }
}

class JSONTransition extends DPDATransition<
  JSONTokenType,
  JSONTokenType,
  JSONValue | "key" | "value" | null
> {}

/**
 * Null currentState means stackTop is the state
 */
const objectTransitions: Array<
  DPDATransition<
    JSONTokenType,
    JSONTokenType,
    JSONValue | "key" | "value" | null
  >
> = [
  // Open object (JSON element is an object)
  new JSONTransition(
    null, // stackTop is the value, and
    JSONTokenType.LBrace, // we find a left brace
    null, // without stackTop,
    null, // so the next value is the object, and
    [JSONValue.Object], // we step inside the object
  ),
  // Close object
  new JSONTransition(
    JSONValue.Object, // We're waiting for a value, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // inside an object,
    null, // so the next value is the parent, and
    [], // we return to the parent
  ),
  // Close object fail-safe
  new JSONTransition(
    null, // stackTop is the value, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // inside an object,
    null, // so the next value is the parent, and
    [], // we return to the parent
  ),
  // Open object key
  new JSONTransition(
    null, // stackTop is the value, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Object, // inside an object,
    "key", // so we've found a key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Escape in object key
  new JSONTransition(
    "key", // Value is the key, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONValue.Object, // inside an object,
    "key", // so we continue parsing the key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object key
  new JSONTransition(
    "key", // Value is the key, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Object, // inside an object,
    null, // so next value is the object, and
    [JSONValue.Object], // stay inside the object
  ),
  // Open object value
  new JSONTransition(
    null, // Value is the object, and
    JSONTokenType.Colon, // we find a colon
    JSONValue.Object, // inside an object,
    "value", // so we wait for a value, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value
  new JSONTransition(
    "value", // We're waiting for a value, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Object, // inside an object,
    null, // so we return to the object to look for a key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Open object value: object
  new JSONTransition(
    JSONValue.Object, // We're waiting for a value, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.Object, // inside an object
    null, // so the next value is the new object, and
    [JSONValue.Object, JSONValue.Object], // we step inside the new object
  ),
  /* Close object value: object (duplicates close object)
  new Transition(
    JSONState.Object, // Value is object, and
    JSONTokenType.ObjectClose, // we find a right brace
    JSONState.Object, // inside an object,
    null, // so we set the value to null, and
    [] // return to the parent
  ),
  */
  // Open object value: array
  new JSONTransition(
    null, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.Object, // inside an object
    JSONValue.Array, // so we're waiting for a value, and
    [JSONValue.Object, JSONValue.Array], // step inside the array
  ),
  /* Close object value: array (duplicates close empty array)
  new Transition(
    null, // We're waiting for a value, and
    JSONTokenType.ArrayClose, // we find a right bracket
    JSONState.Array, // inside an array,
    null, // so we set the value to null, and
    [] // return to the parent
  ),
  */
  // Open object value: string
  new JSONTransition(
    JSONValue.Object, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Object, // inside an object
    JSONValue.String, // so the next Value is a string, and
    [JSONValue.Object], // we stay inside the object
  ),
  // Open object value: string escape
  new JSONTransition(
    JSONValue.String, // Value is a string, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONValue.Object, // inside an object
    JSONValue.String, // so the next Value is a string, and
    [JSONValue.Object], // we stay inside the object
  ),
  // Close string object: string
  new JSONTransition(
    JSONValue.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Object, // inside an object,
    null, // so we've finished parsing the value, await JSONTokenType.Comma, or JSONTokenType.ObjectClose, and
    [JSONValue.Object], // stay inside the object
  ),
  // Open object value: number
  new JSONTransition(
    JSONValue.Object, // We're waiting for a value, and
    JSONTokenType.Number, // we find a number
    JSONValue.Object, // inside an object
    JSONValue.Number, // so the next Value is a number, and
    [JSONValue.Object], // we stay inside the object
  ),
  // Close object value: number (whitespace)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Object, // inside an object,
    null, // so we've finished parsing the value, await JSONTokenType.Comma, or JSONTokenType.ObjectClose, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value: number (comma)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value: number (object close)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // inside an object,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  // Open object value: true
  new JSONTransition(
    JSONValue.Object, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    JSONValue.Object, // inside an object
    JSONValue.True, // so the next value is the boolean true, and
    [JSONValue.Object], // we stay inside the object
  ),
  // Close object value: true (whitespace)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Object, // inside an object,
    null, // so we've finished parsing the value, await JSONTokenType.Comma, or JSONTokenType.ObjectClose, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value: true (comma)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value: true (object close)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // inside an object,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  // Open object value: false
  new JSONTransition(
    JSONValue.Object, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    JSONValue.Object, // inside an object
    JSONValue.False, // so the next value is the boolean false, and
    [JSONValue.Object], // we stay inside the object
  ),
  // Close object value: false (whitespace)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Object, // inside an object,
    null, // so we've finished parsing the value, await JSONTokenType.Comma, or JSONTokenType.ObjectClose, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value: false (comma)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value: false (object close)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // inside an object,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  // Open object value: null
  new JSONTransition(
    JSONValue.Object, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.Object, // inside an object
    JSONValue.Null, // so the next value is the primitive null, and
    [JSONValue.Object], // we stay inside the object
  ),
  // Close object value: null (whitespace)
  new JSONTransition(
    JSONValue.Null, // Value is null, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Object, // inside an object,
    null, // so we've finished parsing the value, await JSONTokenType.Comma, or JSONTokenType.ObjectClose, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value: null (comma)
  new JSONTransition(
    JSONValue.Null, // Value is null, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value: null (object close)
  new JSONTransition(
    JSONValue.Null, // Value is null, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // inside an object,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
];

const arrayTransitions: Array<
  DPDATransition<
    JSONTokenType,
    JSONTokenType,
    JSONValue | "key" | "value" | null
  >
> = [
  // Open array (JSON element is an array)
  new JSONTransition(
    null, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    null, // without context,
    JSONValue.Array, // so we're waiting for a value, and
    [JSONValue.Array], // step inside the array
  ),
  // Close array
  new JSONTransition(
    JSONValue.Array, // We're waiting for a value, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Array, // inside an array,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  // Close array fail-safe
  new JSONTransition(
    null, // We have finished parsing an element, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Array, // inside an array,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  /* Open array element (N/A: elements are open by default)
  new Transition(...),
  */
  // Close array element
  new JSONTransition(
    null, // We have finished parsing an element, and
    JSONTokenType.Comma, // we find a comma,
    JSONValue.Array, // inside an array,
    JSONValue.Array, // so we're waiting for the next value, and
    [JSONValue.Array], // stay inside the array
  ),
  // Open array element: array
  new JSONTransition(
    JSONValue.Array, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.Array, // inside an array,
    JSONValue.Array, // so we're waiting for a value in the new array, and
    [JSONValue.Array, JSONValue.Array], // step inside the new array
  ),
  /* Close array element: array (duplicates close empty array)
  new Transition(
    null, // We're waiting for a value, and
    JSONTokenType.ArrayClose, // we find a right bracket
    JSONState.Array, // inside an array,
    null, // so we set the value to null, and
    [] // return to the parent
  ),
  */
  // Open array element: object
  new JSONTransition(
    JSONValue.Array, // We're waiting for a value, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.Array, // inside an array,
    null, // so the next value is the new object, and
    [JSONValue.Array, JSONValue.Object], // step inside the new object
  ),
  /* Close array element: object
  new Transition(
    ..., // In any state,
    JSONTokenType.ObjectClose, // we find a right bracket
    JSONState.Object, // inside an object,
    null, // so we set the value to null, and
    [] // return to the parent
  ),
  */
  // Open array element: string
  new JSONTransition(
    JSONValue.Array, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Array, // inside an array,
    JSONValue.String, // so we've found a string, and
    [JSONValue.Array], // stay inside the array
  ),
  // Open array element: string escape
  new JSONTransition(
    JSONValue.String, // Value is a string, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONValue.Array, // inside an array
    JSONValue.String, // so the next Value is a string, and
    [JSONValue.Array], // we stay inside the array
  ),
  // Close array element: string
  new JSONTransition(
    JSONValue.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Array, // inside an array,
    null, // so we've finished parsing the element, await JSONTokenType.Comma, or JSONTokenType.ArrayClose, and
    [JSONValue.Array], // stay inside the array
  ),
  // Open array element: number
  new JSONTransition(
    JSONValue.Array, // We're waiting for a value, and
    JSONTokenType.Number, // we find a number
    JSONValue.Array, // inside an array
    JSONValue.Number, // so the next Value is a number, and
    [JSONValue.Array], // we stay inside the array
  ),
  // Close object value: number (whitespace)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Array, // inside an array,
    null, // so we've finished parsing the element, await JSONTokenType.Comma, or JSONTokenType.ArrayClose, and
    [JSONValue.Array], // stay inside the array
  ),
  // Close array element: number (comma)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [JSONValue.Array], // stay inside the array
  ),
  // Close array element: number (array close)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Array, // inside an array,
    null, // so we set the value to null, and
    [null], // return to the parent
  ),
  // Open array element: true
  new JSONTransition(
    JSONValue.Array, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    JSONValue.Array, // inside an array
    JSONValue.True, // so the next value is the boolean true, and
    [JSONValue.Array], // we stay inside the array
  ),
  // Close array element: true (whitespace)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Array, // inside an array,
    null, // so we've finished parsing the element, await JSONTokenType.Comma, or JSONTokenType.ArrayClose, and
    [JSONValue.Array], // stay inside the array
  ),
  // Close array element: true (comma)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [JSONValue.Array], // stay inside the array
  ),
  // Close array element: true (array close)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Array, // inside an array,
    null, // so we set the value to null, and
    [null], // return to the parent
  ),
  // Open array element: false
  new JSONTransition(
    JSONValue.Array, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    JSONValue.Array, // inside an array
    JSONValue.False, // so the next value is the boolean false, and
    [JSONValue.Array], // we stay inside the array
  ),
  // Close array element: false (whitespace)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Array, // inside an array,
    null, // so we've finished parsing the element, await JSONTokenType.Comma, or JSONTokenType.ArrayClose, and
    [JSONValue.Array], // stay inside the array
  ),
  // Close array element: false (comma)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [JSONValue.Array], // stay inside the array
  ),
  // Close array element: false (array close)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Array, // inside an array,
    null, // so we set the value to null, and
    [null], // return to the parent
  ),
  // Open array element: null
  new JSONTransition(
    JSONValue.Array, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.Array, // inside an array
    JSONValue.Null, // so the next value is the primitive null, and
    [JSONValue.Array], // we stay inside the array
  ),
  // Close array element: null (whitespace)
  new JSONTransition(
    JSONValue.Null, // Value is null, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Array, // inside an array,
    null, // so we've finished parsing the element, await JSONTokenType.Comma, or JSONTokenType.ArrayClose, and
    [JSONValue.Array], // stay inside the array
  ),
  // Close array element: null (comma)
  new JSONTransition(
    JSONValue.Null, // Value is null, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [JSONValue.Array], // stay inside the array
  ),
  // Close array element: null (array close)
  new JSONTransition(
    JSONValue.Null, // Value is null, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Array, // inside an array,
    null, // so we set the value to null, and
    [null], // return to the parent
  ),
];

const stringTransitions: Array<
  DPDATransition<
    JSONTokenType,
    JSONTokenType,
    JSONValue | "key" | "value" | null
  >
> = [
  // Open string (JSON element is a string)
  new JSONTransition(
    null, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context,
    JSONValue.String, // so we've found a string, and
    [null], // stay without context
  ),
  // Close string
  new JSONTransition(
    JSONValue.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context
    null, // so we set the value to null, and
    [null], // stay without context
  ),
  // Open string escape
  new JSONTransition(
    JSONValue.String, // Value is a string, and
    JSONTokenType.Escape, // we find an escape character
    null, // without context
    JSONValue.String, // so we return to the string, and
    [null], // stay without context
  ),
];

const numberTransitions: Array<
  DPDATransition<
    JSONTokenType,
    JSONTokenType,
    JSONValue | "key" | "value" | null
  >
> = [
  // Open number
  new JSONTransition(
    null, // We're waiting for a value, and
    JSONTokenType.Number, // we find a number
    null, // without context
    JSONValue.Number, // so we've found a number, and
    [null], // stay without context
  ),
  // Close number (whitespace)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [null], // stay without context
  ),
  // Close number (object start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.LBrace, // we find a left brace
    null, // without context
    JSONValue.Object, // so we have found an object, and
    [JSONValue.Object], // step inside the object
  ),
  // Close number (array start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.LBracket, // we find a left bracket
    null, // without context
    JSONValue.Array, // so we've found an array, and
    [JSONValue.Array], // step inside the array
  ),
  // Close number (string start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context
    JSONValue.String, // so we've found a string, and
    [null], // stay without context
  ),
  // Close number (true start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.True, // we find the letter t
    null, // without context
    JSONValue.True, // so we've found the boolean true, and
    [null], // stay without context
  ),
  // Close number (false start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.False, // we find the letter f
    null, // without context
    JSONValue.False, // so we've found the boolean false, and
    [null], // stay without context
  ),
  // Close number (null start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Null, // we find the letter n
    null, // without context
    JSONValue.Null, // so we've found the primitive null, and
    [null], // stay without context
  ),
];

const trueTransitions: Array<
  DPDATransition<
    JSONTokenType,
    JSONTokenType,
    JSONValue | "key" | "value" | null
  >
> = [
  // Open true
  new JSONTransition(
    null, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    null, // without context
    JSONValue.True, // so we've found the boolean true, and
    [null], // stay without context
  ),
  // Close true (whitespace)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [null], // stay without context
  ),
  // Close true (object start)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.LBrace, // we find a left brace
    null, // without context
    JSONValue.Object, // so we have found an object, and
    [JSONValue.Object], // step inside the object
  ),
  // Close true (array start)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.LBracket, // we find a left bracket
    null, // without context
    JSONValue.Array, // so we've found an array, and
    [JSONValue.Array], // step inside the array
  ),
  // Close true (string start)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context
    JSONValue.String, // so we've found a string, and
    [null], // stay without context
  ),
  // Close true (number start)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.Number, // we find a number
    null, // without context
    JSONValue.Number, // so we've found a number, and
    [null], // stay without context
  ),
  // Close true (true start)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.True, // we find the letter t
    null, // without context
    JSONValue.True, // so we've found a true value, and
    [null], // stay without context
  ),
  // Close true (false start)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.False, // we find the letter f
    null, // without context
    JSONValue.False, // so we've found a false value, and
    [null], // stay without context
  ),
  // Close true (null start)
  new JSONTransition(
    JSONValue.True, // Value is the boolean true, and
    JSONTokenType.Null, // we find the letter n
    null, // without context
    JSONValue.Null, // so we've found the primitive null, and
    [null], // stay without context
  ),
];

const falseTransitions: Array<
  DPDATransition<
    JSONTokenType,
    JSONTokenType,
    JSONValue | "key" | "value" | null
  >
> = [
  // Open false
  new JSONTransition(
    null, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    null, // without context
    JSONValue.False, // so we've found the boolean false, and
    [null], // stay without context
  ),
  // Close false (whitespace)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [null], // stay without context
  ),
  // Close false (object start)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.LBrace, // we find a left brace
    null, // without context
    JSONValue.Object, // so we have found an object, and
    [JSONValue.Object], // step inside the object
  ),
  // Close false (array start)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.LBracket, // we find a left bracket
    null, // without context
    JSONValue.Array, // so we've found an array, and
    [JSONValue.Array], // step inside the array
  ),
  // Close false (string start)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context
    JSONValue.String, // so we've found a string, and
    [null], // stay without context
  ),
  // Close false (number start)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.Number, // we find a true keyword
    null, // without context
    JSONValue.Number, // so we've found a true value, and
    [null], // stay without context
  ),
  // Close false (true start)
  new JSONTransition(
    JSONValue.False, // Value is the boolean, and
    JSONTokenType.True, // we find the letter t
    null, // without context
    JSONValue.True, // so we've found the boolean true, and
    [null], // stay without context
  ),
  // Close false (false start)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.False, // we find the letter f
    null, // without context
    JSONValue.False, // so we've found the boolean false, and
    [null], // stay without context
  ),
  // Close false (null start)
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.Null, // we find the letter n
    null, // without context
    JSONValue.Null, // so we've found the primitive null, and
    [null], // stay without context
  ),
];

const nullTransitions: Array<
  DPDATransition<
    JSONTokenType,
    JSONTokenType,
    JSONValue | "key" | "value" | null
  >
> = [
  // Open null
  new JSONTransition(
    null, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    null, // without context
    JSONValue.Null, // so we've found the primitive null, and
    [null], // stay without context
  ),
  // Close null (whitespace)
  new JSONTransition(
    JSONValue.Null, // Value is the primitive null, and
    JSONTokenType.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [null], // stay without context
  ),
  // Close null (object start)
  new JSONTransition(
    JSONValue.Null, // Value is the primitive null, and
    JSONTokenType.LBrace, // we find a left brace
    null, // without context
    JSONValue.Object, // so we have found an object, and
    [JSONValue.Object], // step inside the object
  ),
  // Close null (array start)
  new JSONTransition(
    JSONValue.Null, // Value is the primitive null, and
    JSONTokenType.LBracket, // we find a left bracket
    null, // without context
    JSONValue.Array, // so we've found an array, and
    [JSONValue.Array], // step inside the array
  ),
  // Close null (string start)
  new JSONTransition(
    JSONValue.Null, // Value is the primitive null, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context
    JSONValue.String, // so we've found a string, and
    [null], // stay without context
  ),
  // Close null (number start)
  new JSONTransition(
    JSONValue.Null, // Value is the primitive null, and
    JSONTokenType.Number, // we find a number
    null, // without context
    JSONValue.Number, // so we've found a true value, and
    [null], // stay without context
  ),
  // Close null (true start)
  new JSONTransition(
    JSONValue.Null, // Value is the primitive null, and
    JSONTokenType.True, // we find the letter t
    null, // without context
    JSONValue.True, // so we've found the boolean true, and
    [null], // stay without context
  ),
  // Close null (false start)
  new JSONTransition(
    JSONValue.Null, // Value is the primitive null, and
    JSONTokenType.False, // we find the letter f
    null, // without context
    JSONValue.False, // so we've found the boolean false, and
    [null], // stay without context
  ),
  // Close null (null start)
  new JSONTransition(
    JSONValue.Null, // Value is the primitive null, and
    JSONTokenType.Null, // we find the letter n
    null, // without context
    JSONValue.Null, // so we've found the primitive null, and
    [null], // stay without context
  ),
];

export const JSONTransitions = [
  ...objectTransitions,
  ...arrayTransitions,
  ...stringTransitions,
  ...numberTransitions,
  ...trueTransitions,
  ...falseTransitions,
  ...nullTransitions,
];
