/**
 * Parser passes chunk to Lexer. Lexer returns tokens. Parser parses the tokens;
 * maintaining Object and Array metadata, and returning primitives with
 * metadata. E.g. ["key", 0, "key"], and "string...".
 */
import type { Lexer } from "~/lib/domain/lexer";
import { type DPDA, DPDATransition } from "~/lib/domain/state";

export enum JSONValue {
  None = "none",
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
  JSONValue
> {}

/**
 * When currentState is Comma, and stackTop is Object, we're looking for a key
 * When currentState is String, and stackTop is Object, we have a key
 * When currentState is String, and stackTop is String, we have a string value
 * When currentState is Whitespace, and stackTop is Object, we're looking for a value
 */
const objectTransitions: Array<
  DPDATransition<JSONTokenType, JSONTokenType, JSONValue>
> = [
  // Open object (JSON element is an object)
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.None, // without context,
    JSONTokenType.Comma, // so we're looking for a key, and
    [JSONValue.None, JSONValue.Object], // we step inside the object
  ),
  // Close empty object
  new JSONTransition(
    JSONTokenType.Comma, // We're waiting for a key, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // inside an object,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // we return to the parent
  ),
  // Close object (fail-safe)
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // inside an object,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // we return to the parent
  ),
  // Open object key
  new JSONTransition(
    JSONTokenType.Comma, // We're waiting for a key, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Object, // inside an object,
    JSONTokenType.String, // so we've found a key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Escape in object key
  new JSONTransition(
    JSONTokenType.String, // Value is the key, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONValue.Object, // inside an object,
    JSONTokenType.String, // so we continue parsing the key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object key
  new JSONTransition(
    JSONTokenType.String, // Value is the key, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Object, // inside an object,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [JSONValue.Object], // stay inside the object
  ),
  // Open object value
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.Colon, // we find a colon
    JSONValue.Object, // inside an object,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Object, // inside an object,
    JSONTokenType.Comma, // so we're looking for a key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Open object value: object
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.Object, // inside an object,
    JSONTokenType.Comma, // so we're looking for a key, and
    [JSONValue.Object, JSONValue.Object], // we step inside the new object
  ),
  /* Close object value: object [duplicate]
  new Transition(
    JSONTokenType.Whitespace, // We're looking for a value, and
    JSONTokenType.RBrace, // we find a right brace
    JSONState.Object, // inside an object,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [] // return to the parent
  ),
  */
  // Open object value: array
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.Object, // inside an object,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [JSONValue.Object, JSONValue.Array], // step inside the array
  ),
  /* Close object value: array [duplicate]
  new Transition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONState.Array, // inside an array,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [] // return to the parent
  ),
  */
  // Open object value: string
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Object, // inside an object,
    JSONTokenType.String, // so the next value is a string, and
    [JSONValue.Object, JSONValue.String], // we stay inside the object
  ),
  /* Open object value: string escape [duplicate]
  new JSONTransition(
    JSONTokenType.String, // Value is a string, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONValue.String, // after the string,
    JSONTokenType.String, // so the next value is a string, and
    [JSONValue.String], // we stay inside the string
  ),
  */
  /* Close string object: string [duplicate]
  new JSONTransition(
    JSONTokenType.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.String, // after the string,
    JSONTokenType.Whitespace, // so we await JSONTokenType.Comma, or JSONTokenType.RBrace, and
    [], // return to the parent
  ),
  */
  // Open object value: number
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.Number, // we find a number
    JSONValue.Object, // inside an object,
    JSONTokenType.Number, // so the next value is a number, and
    [JSONValue.Object, JSONValue.Number], // we step inside the number
  ),
  /* Close object value: number (whitespace) [duplicate]
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Number, // after a number,
    JSONTokenType.Whitespace, // so await JSONTokenType.Comma, or JSONTokenType.RBrace, and
    [], // stay inside the object
  ),
  */
  // Close object value: number (comma)
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Number, // after a number,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close object value: number (object close)
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Number, // after a number,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open object value: true
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    JSONValue.Object, // inside an object,
    JSONTokenType.True, // so the next value is a true literal, and
    [JSONValue.Object, JSONValue.True], // we step inside the true literal
  ),
  /* Close object value: true (whitespace) [duplicate]
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.True, // after the true literal,
    JSONTokenType.Whitespace, // so await JSONTokenType.Comma, or JSONTokenType.RBrace, and
    [], // return to the parent
  ),
  */
  // Close object value: true (comma)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.True, // after the true literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close object value: true (object close)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.True, // after the true literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open object value: false
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    JSONValue.Object, // inside an object,
    JSONTokenType.False, // so the next value is a false literal, and
    [JSONValue.Object, JSONValue.False], // we step inside the false literal
  ),
  /* Close object value: false (whitespace) [duplicate]
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.False, // after the false literal,
    JSONTokenType.Whitespace, // so we await JSONTokenType.Comma, or JSONTokenType.RBrace, and
    [], // return to the parent
  ),
  */
  // Close object value: false (comma)
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.False, // after the false literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close object value: false (object close)
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // after the false literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open object value: null
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.Object, // inside an object,
    JSONTokenType.Null, // so the next value is a null literal, and
    [JSONValue.Object, JSONValue.Null], // we step inside the null literal
  ),
  /* Close object value: null (whitespace) [duplicate]
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Null, // after the null literal,
    JSONTokenType.Whitespace, // so we await JSONTokenType.Comma, or JSONTokenType.RBrace, and
    [], // stay inside the object
  ),
  */
  // Close object value: null (comma)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Null, // after the null literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close object value: null (object close)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Null, // after the null literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
];

const arrayTransitions: Array<
  DPDATransition<JSONTokenType, JSONTokenType, JSONValue>
> = [
  // Open array (JSON element is an array)
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.None, // without context,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [JSONValue.None, JSONValue.Array], // step inside the array
  ),
  // Close array
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Array, // inside an array,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  /* Open array element (N/A: elements are open by default)
  new Transition(...),
  */
  // Close array element
  new JSONTransition(
    JSONTokenType.Whitespace, // We have finished parsing an element, and
    JSONTokenType.Comma, // we find a comma,
    JSONValue.Array, // inside an array,
    JSONTokenType.Whitespace, // so we're looking for the next value, and
    [JSONValue.Array], // stay inside the array
  ),
  // Open array element: array
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.Array, // inside an array,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [JSONValue.Array, JSONValue.Array], // step inside the new array
  ),
  /* Close array element: array [duplicate]
  new Transition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONState.Array, // inside an array,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [] // return to the parent
  ),
  */
  // Open array element: object
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.Array, // inside an array,
    JSONTokenType.Comma, // so we're looking for a key, and
    [JSONValue.Array, JSONValue.Object], // step inside the new object
  ),
  /* Close array element: object
  new Transition(
    ..., // In any state,
    JSONTokenType.RBrace, // we find a right bracket
    JSONState.Object, // inside an object,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [] // return to the parent
  ),
  */
  // Open array element: string
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Array, // inside an array,
    JSONTokenType.String, // so the next value is a string, and
    [JSONValue.Array, JSONValue.String], // we stay inside the array
  ),
  /* Open array element: string escape [duplicate]
  new JSONTransition(
    JSONTokenType.String, // Value is a string, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONValue.String, // inside the string,
    JSONTokenType.String, // so the next value is a string, and
    [JSONValue.String], // we stay inside the string
  ),
  */
  /* Close array element: string [duplicate]
  new JSONTransition(
    JSONTokenType.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.String, // inside the string,
    JSONTokenType.Whitespace, // so we await JSONTokenType.Comma, or JSONTokenType.RBracket, and
    [], // return to the parent
  ),
  */
  // Open array element: number
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.Number, // we find a number
    JSONValue.Array, // inside an array
    JSONTokenType.Number, // so the next value is a number, and
    [JSONValue.Array, JSONValue.Number], // we step inside the number
  ),
  /* Close object value: number (whitespace) [duplicate]
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Number, // after the number,
    JSONTokenType.Whitespace, // so we await JSONTokenType.Comma, or JSONTokenType.RBracket, and
    [], // we return to the parent
  ),
  */
  /* Close array element: number (comma) [duplicate]
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Number, // after a number,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  */
  // Close array element: number (array close)
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Number, // after a number,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open array element: true
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    JSONValue.Array, // inside an array,
    JSONTokenType.True, // so the next value is a true literal, and
    [JSONValue.Array, JSONValue.True], // we step inside the true literal
  ),
  /* Close array element: true (whitespace) [duplicate]
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.True, // after the true literal,
    JSONTokenType.Whitespace, // so we await JSONTokenType.Comma, or JSONTokenType.RBracket, and
    [], // return to the parent
  ),
  */
  /* Close array element: true (comma) [duplicate]
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.True, // after the true literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  */
  // Close array element: true (array close)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.True, // after the true literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open array element: false
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    JSONValue.Array, // inside an array
    JSONTokenType.False, // so the next value is a false literal, and
    [JSONValue.Array, JSONValue.False], // we step inside the false literal
  ),
  /* Close array element: false (whitespace) [duplicate]
  new JSONTransition(
    JSONTokenType.False, // Value is the boolean false, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.False, // after the false literal,
    JSONTokenType.Whitespace, // so we await JSONTokenType.Comma, or JSONTokenType.RBracket, and
    [], // return to the parent
  ),
  */
  /* Close array element: false (comma) [duplicate]
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.False, // after the false literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  */
  // Close array element: false (array close)
  new JSONTransition(
    JSONTokenType.False, // Value is the false literal, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.False, // after the false literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open array element: null
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.Array, // inside an array
    JSONTokenType.Null, // so the next value is a null literal, and
    [JSONValue.Array, JSONValue.Null], // we step inside the null literal
  ),
  /* Close array element: null (whitespace) [duplicate]
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Null, // after the null literal,
    JSONTokenType.Whitespace, // so we await JSONTokenType.Comma, or JSONTokenType.RBracket, and
    [], // return to the parent
  ),
  */
  /* Close array element: null (comma) [duplicate]
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Null, // after the null literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  */
  // Close array element: null (array close)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Null, // after the null literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
];

const stringTransitions: Array<
  DPDATransition<JSONTokenType, JSONTokenType, JSONValue>
> = [
  // Open string (JSON element is a string)
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.None, // without context,
    JSONTokenType.String, // so the next value is a string, and
    [JSONValue.None, JSONValue.String], // step inside the string
  ),
  // Close string
  new JSONTransition(
    JSONTokenType.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.String, // inside a string,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open string escape
  new JSONTransition(
    JSONTokenType.String, // Value is a string, and
    JSONTokenType.Escape, // we find an escape character
    JSONValue.String, // inside a string,
    JSONTokenType.String, // so the value is still a string, and
    [JSONValue.String], // we stay inside the string
  ),
];

const numberTransitions: Array<
  DPDATransition<JSONTokenType, JSONTokenType, JSONValue>
> = [
  // Open number
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.Number, // we find a number
    JSONValue.None, // without context,
    JSONTokenType.Number, // so the next value is a number, and
    [JSONValue.None, JSONValue.Number], // step inside the number
  ),
  // Close number (whitespace)
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Number, // after a number,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close number (object start)
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.Number, // after a number,
    JSONTokenType.Whitespace, // we're looking for a key, and
    [JSONValue.Object], // step inside the object
  ),
  // Close number (array start)
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.Number, // after a number,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [JSONValue.Array], // step inside the array
  ),
  // Close number (string start)
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Number, // after a number,
    JSONTokenType.String, // so the next value is a string, and
    [JSONValue.String], // we step inside the string
  ),
  // Close number (true start)
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.True, // we find the letter t
    JSONValue.Number, // after a number,
    JSONTokenType.True, // so the next value is true literal, and
    [JSONValue.True], // we step inside the true literal
  ),
  // Close number (false start)
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.False, // we find the letter f
    JSONValue.Number, // after a number,
    JSONTokenType.False, // so the next value is false literal, and
    [JSONValue.False], // we step inside the false literal
  ),
  // Close number (null start)
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.Number, // after a number,
    JSONTokenType.Null, // so the next value is null literal, and
    [JSONValue.Null], // we step inside the null literal
  ),
];

const trueTransitions: Array<
  DPDATransition<JSONTokenType, JSONTokenType, JSONValue>
> = [
  // Open true
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    JSONValue.None, // without context,
    JSONTokenType.True, // so we've found a true literal, and
    [JSONValue.None, JSONValue.True], // step inside the true literal
  ),
  // Close true (whitespace)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.True, // after the true literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close true (object start)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.True, // after the true literal,
    JSONTokenType.Comma, // so we're looking for a key, and
    [JSONValue.Object], // step inside the object
  ),
  // Close true (array start)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.True, // after the true literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [JSONValue.Array], // step inside the array
  ),
  // Close true (string start)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.True, // after the true literal,
    JSONTokenType.String, // so the next value is a string, and
    [JSONValue.String], // we step inside the string
  ),
  // Close true (number start)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.Number, // we find a number
    JSONValue.True, // after the true literal,
    JSONTokenType.Number, // so the next value is a number, and
    [JSONValue.Number], // we step inside the number
  ),
  // Close true (true start)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.True, // we find the letter t
    JSONValue.True, // after the true literal,
    JSONTokenType.True, // so the next value is a true literal, and
    [JSONValue.True], // we step inside the true literal
  ),
  // Close true (false start)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.False, // we find the letter f
    JSONValue.True, // after the true literal,
    JSONTokenType.False, // so the next value is a false literal, and
    [JSONValue.False], // we step inside the false literal
  ),
  // Close true (null start)
  new JSONTransition(
    JSONTokenType.True, // Value is true literal, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.True, // after the true literal,
    JSONTokenType.Null, // so the next value is a null literal, and
    [JSONValue.Null], // we step inside the null literal
  ),
];

const falseTransitions: Array<
  DPDATransition<JSONTokenType, JSONTokenType, JSONValue>
> = [
  // Open false
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    JSONValue.None, // without context
    JSONTokenType.False, // so the next value is a false literal, and
    [JSONValue.None, JSONValue.False], // we step inside the false literal
  ),
  // Close false (whitespace)
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.False, // after the false literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close false (object start)
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.False, // after the false literal,
    JSONTokenType.Comma, // so we're looking for a key, and
    [JSONValue.Object], // step inside the object
  ),
  // Close false (array start)
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.False, // after the false literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [JSONValue.Array], // step inside the array
  ),
  // Close false (string start)
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.False, // after the false literal,
    JSONTokenType.String, // so the next value is a string, and
    [JSONValue.String], // we step inside the string
  ),
  // Close false (number start)
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.Number, // we find a number
    JSONValue.False, // after the false literal,
    JSONTokenType.Number, // so the next value is a number, and
    [JSONValue.Number], // we step inside the number
  ),
  // Close false (true start)
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.True, // we find the letter t
    JSONValue.False, // after the false literal,
    JSONTokenType.True, // so the next value is a true literal, and
    [JSONValue.True], // we step inside the true literal
  ),
  // Close false (false start)
  new JSONTransition(
    JSONTokenType.False, // Value is the false literal, and
    JSONTokenType.False, // we find the letter f
    JSONValue.False, // after the false literal,
    JSONTokenType.False, // so the next value is a false literal, and
    [JSONValue.False], // we step inside the false literal
  ),
  // Close false (null start)
  new JSONTransition(
    JSONTokenType.False, // Value is false literal, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.False, // after the false literal,
    JSONTokenType.Null, // so the next value is a null literal, and
    [JSONValue.Null], // we step inside the null literal
  ),
];

const nullTransitions: Array<
  DPDATransition<JSONTokenType, JSONTokenType, JSONValue>
> = [
  // Open null
  new JSONTransition(
    JSONTokenType.Whitespace, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.None, // without context
    JSONTokenType.Null, // so the next value is a null literal, and
    [JSONValue.Null, JSONValue.Null], // we step inside the null literal
  ),
  // Close null (whitespace)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Null, // after the null literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close null (object start)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.Null, // after the null literal,
    JSONTokenType.Comma, // so we're looking for a key, and
    [JSONValue.Object], // step inside the object
  ),
  // Close null (array start)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.Null, // after the null literal,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [JSONValue.Array], // step inside the array
  ),
  // Close null (string start)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Null, // after the null literal,
    JSONTokenType.String, // so the next value is a string, and
    [JSONValue.String], // we step inside the string
  ),
  // Close null (number start)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.Number, // we find a number
    JSONValue.Null, // after the null literal,
    JSONTokenType.Number, // so the next value is a number, and
    [JSONValue.Number], // we step inside the number
  ),
  // Close null (true start)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.True, // we find the letter t
    JSONValue.Null, // after the null literal,
    JSONTokenType.True, // so the next value is a true literal, and
    [JSONValue.True], // we step inside the true literal
  ),
  // Close null (false start)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.False, // we find the letter f
    JSONValue.Null, // after the null literal,
    JSONTokenType.False, // so the next value is a false literal, and
    [JSONValue.False], // we step inside the false literal
  ),
  // Close null (null start)
  new JSONTransition(
    JSONTokenType.Null, // Value is null literal, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.Null, // after the null literal,
    JSONTokenType.Null, // so the next value is a null literal, and
    [JSONValue.Null], // we step inside the null literal
  ),
];

export const JSONTransitions: Array<
  DPDATransition<JSONTokenType, JSONTokenType, JSONValue>
> = [
  ...objectTransitions,
  ...arrayTransitions,
  ...stringTransitions,
  ...numberTransitions,
  ...trueTransitions,
  ...falseTransitions,
  ...nullTransitions,
];
