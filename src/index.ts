import invariant from "tiny-invariant";
import { Lexer } from "~/lib/domain/lexer";
import { FSM, PDA, PDATransition } from "~/lib/domain/state";
import { StreamProcessorFactory } from "~/lib/domain/stream-adapter";

/**
 * TODO
 * - [ ] Emit error event for unexpected JSONTokenType, e.g. JSONTokenType.Comma when waiting for a value inside an JSONState.Object
 * - [ ] Replace template literal with nested map for transition lookup
 */

export enum JSONState {
  Object = "OBJECT",
  Array = "ARRAY",
  String = "STRING",
  Number = "NUMBER",
  True = "TRUE",
  False = "FALSE",
  Null = "NULL",
}

/**
 *
 * | Token Type       | Example Lexeme | Description         |
 * | ---------------- | -------------- | ------------------- |
 * | `LBRACE`         | `{`            | Start of an object  |
 * | `RBRACE`         | `}`            | End of an object    |
 * | `LBRACKET`       | `[`            | Start of an array   |
 * | `RBRACKET`       | `]`            | End of an array     |
 * | `COLON`          | `:`            | Key/value separator |
 * | `COMMA`          | `,`            | Separator for items |
 * | `STRING`         | `"name"`       | Quoted Unicode text |
 * | `NUMBER`         | `123`, `4.5`   | Integer or float    |
 * | `TRUE`           | `true`         | Boolean literal     |
 * | `FALSE`          | `false`        | Boolean literal     |
 * | `NULL`           | `null`         | Null literal        |
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

class JSONStep extends PDATransition<JSONState | "key" | null, JSONTokenType> {}
class JSONFSM extends FSM<JSONState | "key" | null, JSONTokenType> {}
class JSONPDA extends PDA<JSONState | "key" | null, JSONTokenType> {}

export class JSONLexer extends Lexer<JSONState, JSONTokenType> {
  private escapeCharacter: JSONTokenType = JSONTokenType.Escape;
  private isEscaped = false;

  public process(
    chunk: string,
    tokenTypes: Record<string, JSONTokenType> = JSONTokenType,
  ) {
    this.setTokenTypes(tokenTypes);
    const [index, tokenType] = this.findFirstTokenType(chunk);
    // if there is no lexeme in the chunk, emit the chunk
    if (index < 0) {
      this.emit({ type: this.fsm.state, lexeme: chunk });
      return;
    }
    invariant(
      tokenType,
      "findFirstTokenType found token, but token type is null",
    );
    // else there is a lexeme in the chunk
    // if the lexeme is not the first character in the chunk, emit everything up to (not including) the lexeme
    if (index > 0) {
      this.emit({ type: this.fsm.state, lexeme: chunk.slice(0, index) });
    }

    this.fsm.transition(tokenType);

    // XXX: it's the role of the transitions to determine how state changes, it's our job to determine what/how to emit in different states
    switch (this.fsm.state) {
      case JSONState.String: {
        const mask = new Uint8Array(128);
        mask[JSONTokenType.String.toString().charCodeAt(0)] = 1;
        mask[JSONTokenType.Escape.toString().charCodeAt(0)] = 1;

        // consume until the end of the number, and emit
        // do call findNextTokenType
        // do not trigger on other tokens until the end of the string
        break;
      }
      case JSONState.Number:
      case JSONState.True:
      case JSONState.False:
      case JSONState.Null:
        // consume until the end of the lexeme, and emit
        // do not call findNextTokenType
        break;
      case JSONState.Object:
      case JSONState.Array:
        this.emit({ type: tokenType, lexeme: chunk.slice(index, index + 1) });
        break;
    }

    switch (tokenType) {
      case JSONTokenType.String:
        this.fsm.transition(JSONTokenType.String);
        break;
      case JSONTokenType.Number:
        this.fsm.transition(JSONTokenType.Number);
        break;
      case JSONTokenType.True:
        this.fsm.transition(JSONTokenType.True);
        break;
      case JSONTokenType.False:
        this.fsm.transition(JSONTokenType.False);
        break;
      case JSONTokenType.Null:
        this.fsm.transition(JSONTokenType.Null);
        break;
      case JSONTokenType.Escape:
        this.fsm.transition(JSONTokenType.Escape);
        break;
      // case JSONTokenType.LBrace:
      // case JSONTokenType.RBrace:
      // case JSONTokenType.LBracket:
      // case JSONTokenType.RBracket:
      // case JSONTokenType.Colon:
      // case JSONTokenType.Comma:
      default:
        this.emit({ type: tokenType, lexeme: chunk.slice(index, index + 1) });
        break;
    }
    // this if statement is first so that we emit "\\\\"
    if (this.isEscaped) {
      this.emit({
        type: this.escapeCharacter,
        lexeme: this.escapeCharacter.toString() + token.lexeme,
      });
      this.isEscaped = false;
      return;
    }
    if (token.lexeme === this.escapeCharacter.toString()) {
      this.isEscaped = true;
      return;
    }

    // if the lexeme is not the last character in the chunk
    if (index + 1 < chunk.length) {
      this.process(chunk.slice(index + 1)); // process everything after (not including) the lexeme
    }
  }
}

const objectTransitions: Array<
  PDATransition<JSONState | "key" | null, JSONTokenType>
> = [
  // Open object (JSON element is an object)
  new JSONStep(
    null, // Value is the absence of context, and
    JSONTokenType.LBrace, // we find a left brace
    null, // without context,
    null, // so the next value is the object, and
    [JSONState.Object], // we step inside the object
  ),
  // Close object
  new JSONStep(
    JSONState.Object, // We're waiting for a value, and
    JSONTokenType.RBrace, // we find a right brace
    JSONState.Object, // inside an object,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  // Close object fail-safe
  new JSONStep(
    null, // Value is the object, and
    JSONTokenType.RBrace, // we find a right brace
    JSONState.Object, // inside an object,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  // Open object key
  new JSONStep(
    null, // Value is the object, and
    JSONTokenType.String, // we find a quotation mark
    JSONState.Object, // inside an object,
    "key", // so we've found a key, and
    [JSONState.Object], // stay inside the object
  ),
  // Escape in object key
  new JSONStep(
    "key", // Value is the key, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONState.Object, // inside an object,
    "key", // so we continue parsing the key, and
    [JSONState.Object], // stay inside the object
  ),
  // Close object key
  new JSONStep(
    "key", // Value is the key, and
    JSONTokenType.String, // we find a quotation mark
    JSONState.Object, // inside an object,
    null, // so next value is the object, and
    [JSONState.Object], // stay inside the object
  ),
  // Open object value
  new JSONStep(
    null, // Value is the object, and
    JSONTokenType.Colon, // we find a colon
    JSONState.Object, // inside an object,
    JSONState.Object, // so we wait for a value, and
    [JSONState.Object], // stay inside the object
  ),
  // Close object value
  new JSONStep(
    JSONState.Object, // We're waiting for a value, and
    JSONTokenType.Comma, // we find a comma
    JSONState.Object, // inside an object,
    null, // so we return to the object to look for a key, and
    [JSONState.Object], // stay inside the object
  ),
  // Open object value: object
  new JSONStep(
    JSONState.Object, // We're waiting for a value, and
    JSONTokenType.LBrace, // we find a left brace
    JSONState.Object, // inside an object
    null, // so the next value is the new object, and
    [JSONState.Object, JSONState.Object], // we step inside the new object
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
  new JSONStep(
    null, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONState.Object, // inside an object
    JSONState.Array, // so we're waiting for a value, and
    [JSONState.Object, JSONState.Array], // step inside the array
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
  new JSONStep(
    JSONState.Object, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    JSONState.Object, // inside an object
    JSONState.String, // so the next Value is a string, and
    [JSONState.Object], // we stay inside the object
  ),
  // Open object value: string escape
  new JSONStep(
    JSONState.String, // Value is a string, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONState.Object, // inside an object
    JSONState.String, // so the next Value is a string, and
    [JSONState.Object], // we stay inside the object
  ),
  // Close string object: string
  new JSONStep(
    JSONState.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    JSONState.Object, // inside an object,
    null, // so we've finished parsing the value, await JSONTokenType.Comma, or JSONTokenType.ObjectClose, and
    [JSONState.Object], // stay inside the object
  ),
  // Open object value: number
  new JSONStep(
    JSONState.Object, // We're waiting for a value, and
    JSONTokenType.Number, // we find a number
    JSONState.Object, // inside an object
    JSONState.Number, // so the next Value is a number, and
    [JSONState.Object], // we stay inside the object
  ),
  // Close object value: number (whitespace)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONState.Object, // inside an object,
    null, // so we've finished parsing the value, await JSONTokenType.Comma, or JSONTokenType.ObjectClose, and
    [JSONState.Object], // stay inside the object
  ),
  // Close object value: number (comma)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.Comma, // we find a comma
    JSONState.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [JSONState.Object], // stay inside the object
  ),
  // Close object value: number (object close)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.RBrace, // we find a right brace
    JSONState.Object, // inside an object,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  // Open object value: true
  new JSONStep(
    JSONState.Object, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    JSONState.Object, // inside an object
    JSONState.True, // so the next value is the boolean true, and
    [JSONState.Object], // we stay inside the object
  ),
  // Close object value: true (whitespace)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONState.Object, // inside an object,
    null, // so we've finished parsing the value, await JSONTokenType.Comma, or JSONTokenType.ObjectClose, and
    [JSONState.Object], // stay inside the object
  ),
  // Close object value: true (comma)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.Comma, // we find a comma
    JSONState.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [JSONState.Object], // stay inside the object
  ),
  // Close object value: true (object close)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.RBrace, // we find a right brace
    JSONState.Object, // inside an object,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  // Open object value: false
  new JSONStep(
    JSONState.Object, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    JSONState.Object, // inside an object
    JSONState.False, // so the next value is the boolean false, and
    [JSONState.Object], // we stay inside the object
  ),
  // Close object value: false (whitespace)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONState.Object, // inside an object,
    null, // so we've finished parsing the value, await JSONTokenType.Comma, or JSONTokenType.ObjectClose, and
    [JSONState.Object], // stay inside the object
  ),
  // Close object value: false (comma)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.Comma, // we find a comma
    JSONState.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [JSONState.Object], // stay inside the object
  ),
  // Close object value: false (object close)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.RBrace, // we find a right brace
    JSONState.Object, // inside an object,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  // Open object value: null
  new JSONStep(
    JSONState.Object, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    JSONState.Object, // inside an object
    JSONState.Null, // so the next value is the primitive null, and
    [JSONState.Object], // we stay inside the object
  ),
  // Close object value: null (whitespace)
  new JSONStep(
    JSONState.Null, // Value is null, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONState.Object, // inside an object,
    null, // so we've finished parsing the value, await JSONTokenType.Comma, or JSONTokenType.ObjectClose, and
    [JSONState.Object], // stay inside the object
  ),
  // Close object value: null (comma)
  new JSONStep(
    JSONState.Null, // Value is null, and
    JSONTokenType.Comma, // we find a comma
    JSONState.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [JSONState.Object], // stay inside the object
  ),
  // Close object value: null (object close)
  new JSONStep(
    JSONState.Null, // Value is null, and
    JSONTokenType.RBrace, // we find a right brace
    JSONState.Object, // inside an object,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
];

const arrayTransitions: Array<
  PDATransition<JSONState | "key" | null, JSONTokenType>
> = [
  // Open array (JSON element is an array)
  new JSONStep(
    null, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    null, // without context,
    JSONState.Array, // so we're waiting for a value, and
    [JSONState.Array], // step inside the array
  ),
  // Close array
  new JSONStep(
    JSONState.Array, // We're waiting for a value, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONState.Array, // inside an array,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  // Close array fail-safe
  new JSONStep(
    null, // We have finished parsing an element, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONState.Array, // inside an array,
    null, // so the next value is the parent, and
    [null], // we return to the parent
  ),
  /* Open array element (N/A: elements are open by default)
  new Transition(...),
  */
  // Close array element
  new JSONStep(
    null, // We have finished parsing an element, and
    JSONTokenType.Comma, // we find a comma,
    JSONState.Array, // inside an array,
    JSONState.Array, // so we're waiting for the next value, and
    [JSONState.Array], // stay inside the array
  ),
  // Open array element: array
  new JSONStep(
    JSONState.Array, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONState.Array, // inside an array,
    JSONState.Array, // so we're waiting for a value in the new array, and
    [JSONState.Array, JSONState.Array], // step inside the new array
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
  new JSONStep(
    JSONState.Array, // We're waiting for a value, and
    JSONTokenType.LBrace, // we find a left brace
    JSONState.Array, // inside an array,
    null, // so the next value is the new object, and
    [JSONState.Array, JSONState.Object], // step inside the new object
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
  new JSONStep(
    JSONState.Array, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    JSONState.Array, // inside an array,
    JSONState.String, // so we've found a string, and
    [JSONState.Array], // stay inside the array
  ),
  // Open array element: string escape
  new JSONStep(
    JSONState.String, // Value is a string, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONState.Array, // inside an array
    JSONState.String, // so the next Value is a string, and
    [JSONState.Array], // we stay inside the array
  ),
  // Close array element: string
  new JSONStep(
    JSONState.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    JSONState.Array, // inside an array,
    null, // so we've finished parsing the element, await JSONTokenType.Comma, or JSONTokenType.ArrayClose, and
    [JSONState.Array], // stay inside the array
  ),
  // Open array element: number
  new JSONStep(
    JSONState.Array, // We're waiting for a value, and
    JSONTokenType.Number, // we find a number
    JSONState.Array, // inside an array
    JSONState.Number, // so the next Value is a number, and
    [JSONState.Array], // we stay inside the array
  ),
  // Close object value: number (whitespace)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONState.Array, // inside an array,
    null, // so we've finished parsing the element, await JSONTokenType.Comma, or JSONTokenType.ArrayClose, and
    [JSONState.Array], // stay inside the array
  ),
  // Close array element: number (comma)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.Comma, // we find a comma
    JSONState.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [JSONState.Array], // stay inside the array
  ),
  // Close array element: number (array close)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONState.Array, // inside an array,
    null, // so we set the value to null, and
    [null], // return to the parent
  ),
  // Open array element: true
  new JSONStep(
    JSONState.Array, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    JSONState.Array, // inside an array
    JSONState.True, // so the next value is the boolean true, and
    [JSONState.Array], // we stay inside the array
  ),
  // Close array element: true (whitespace)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONState.Array, // inside an array,
    null, // so we've finished parsing the element, await JSONTokenType.Comma, or JSONTokenType.ArrayClose, and
    [JSONState.Array], // stay inside the array
  ),
  // Close array element: true (comma)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.Comma, // we find a comma
    JSONState.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [JSONState.Array], // stay inside the array
  ),
  // Close array element: true (array close)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONState.Array, // inside an array,
    null, // so we set the value to null, and
    [null], // return to the parent
  ),
  // Open array element: false
  new JSONStep(
    JSONState.Array, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    JSONState.Array, // inside an array
    JSONState.False, // so the next value is the boolean false, and
    [JSONState.Array], // we stay inside the array
  ),
  // Close array element: false (whitespace)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONState.Array, // inside an array,
    null, // so we've finished parsing the element, await JSONTokenType.Comma, or JSONTokenType.ArrayClose, and
    [JSONState.Array], // stay inside the array
  ),
  // Close array element: false (comma)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.Comma, // we find a comma
    JSONState.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [JSONState.Array], // stay inside the array
  ),
  // Close array element: false (array close)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONState.Array, // inside an array,
    null, // so we set the value to null, and
    [null], // return to the parent
  ),
  // Open array element: null
  new JSONStep(
    JSONState.Array, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    JSONState.Array, // inside an array
    JSONState.Null, // so the next value is the primitive null, and
    [JSONState.Array], // we stay inside the array
  ),
  // Close array element: null (whitespace)
  new JSONStep(
    JSONState.Null, // Value is null, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONState.Array, // inside an array,
    null, // so we've finished parsing the element, await JSONTokenType.Comma, or JSONTokenType.ArrayClose, and
    [JSONState.Array], // stay inside the array
  ),
  // Close array element: null (comma)
  new JSONStep(
    JSONState.Null, // Value is null, and
    JSONTokenType.Comma, // we find a comma
    JSONState.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [JSONState.Array], // stay inside the array
  ),
  // Close array element: null (array close)
  new JSONStep(
    JSONState.Null, // Value is null, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONState.Array, // inside an array,
    null, // so we set the value to null, and
    [null], // return to the parent
  ),
];

const stringTransitions: Array<
  PDATransition<JSONState | "key" | null, JSONTokenType>
> = [
  // Open string (JSON element is a string)
  new JSONStep(
    null, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context,
    JSONState.String, // so we've found a string, and
    [null], // stay without context
  ),
  // Close string
  new JSONStep(
    JSONState.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context
    null, // so we set the value to null, and
    [null], // stay without context
  ),
  // Open string escape
  new JSONStep(
    JSONState.String, // Value is a string, and
    JSONTokenType.Escape, // we find an escape character
    null, // without context
    JSONState.String, // so we return to the string, and
    [null], // stay without context
  ),
];

const numberTransitions = [
  // Open number
  new JSONStep(
    null, // We're waiting for a value, and
    JSONTokenType.Number, // we find a number
    null, // without context
    JSONState.Number, // so we've found a number, and
    [null], // stay without context
  ),
  // Close number (whitespace)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [null], // stay without context
  ),
  // Close number (object start)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.LBrace, // we find a left brace
    null, // without context
    JSONState.Object, // so we have found an object, and
    [JSONState.Object], // step inside the object
  ),
  // Close number (array start)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.LBracket, // we find a left bracket
    null, // without context
    JSONState.Array, // so we've found an array, and
    [JSONState.Array], // step inside the array
  ),
  // Close number (string start)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context
    JSONState.String, // so we've found a string, and
    [null], // stay without context
  ),
  // Close number (true start)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.True, // we find the letter t
    null, // without context
    JSONState.True, // so we've found the boolean true, and
    [null], // stay without context
  ),
  // Close number (false start)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.False, // we find the letter f
    null, // without context
    JSONState.False, // so we've found the boolean false, and
    [null], // stay without context
  ),
  // Close number (null start)
  new JSONStep(
    JSONState.Number, // Value is a number, and
    JSONTokenType.Null, // we find the letter n
    null, // without context
    JSONState.Null, // so we've found the primitive null, and
    [null], // stay without context
  ),
];

const trueTransitions: Array<
  PDATransition<JSONState | "key" | null, JSONTokenType>
> = [
  // Open true
  new JSONStep(
    null, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    null, // without context
    JSONState.True, // so we've found the boolean true, and
    [null], // stay without context
  ),
  // Close true (whitespace)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [null], // stay without context
  ),
  // Close true (object start)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.LBrace, // we find a left brace
    null, // without context
    JSONState.Object, // so we have found an object, and
    [JSONState.Object], // step inside the object
  ),
  // Close true (array start)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.LBracket, // we find a left bracket
    null, // without context
    JSONState.Array, // so we've found an array, and
    [JSONState.Array], // step inside the array
  ),
  // Close true (string start)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context
    JSONState.String, // so we've found a string, and
    [null], // stay without context
  ),
  // Close true (number start)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.Number, // we find a number
    null, // without context
    JSONState.Number, // so we've found a number, and
    [null], // stay without context
  ),
  // Close true (true start)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.True, // we find the letter t
    null, // without context
    JSONState.True, // so we've found a true value, and
    [null], // stay without context
  ),
  // Close true (false start)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.False, // we find the letter f
    null, // without context
    JSONState.False, // so we've found a false value, and
    [null], // stay without context
  ),
  // Close true (null start)
  new JSONStep(
    JSONState.True, // Value is the boolean true, and
    JSONTokenType.Null, // we find the letter n
    null, // without context
    JSONState.Null, // so we've found the primitive null, and
    [null], // stay without context
  ),
];

const falseTransitions: Array<
  PDATransition<JSONState | "key" | null, JSONTokenType>
> = [
  // Open false
  new JSONStep(
    null, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    null, // without context
    JSONState.False, // so we've found the boolean false, and
    [null], // stay without context
  ),
  // Close false (whitespace)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [null], // stay without context
  ),
  // Close false (object start)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.LBrace, // we find a left brace
    null, // without context
    JSONState.Object, // so we have found an object, and
    [JSONState.Object], // step inside the object
  ),
  // Close false (array start)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.LBracket, // we find a left bracket
    null, // without context
    JSONState.Array, // so we've found an array, and
    [JSONState.Array], // step inside the array
  ),
  // Close false (string start)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context
    JSONState.String, // so we've found a string, and
    [null], // stay without context
  ),
  // Close false (number start)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.Number, // we find a true keyword
    null, // without context
    JSONState.Number, // so we've found a true value, and
    [null], // stay without context
  ),
  // Close false (true start)
  new JSONStep(
    JSONState.False, // Value is the boolean, and
    JSONTokenType.True, // we find the letter t
    null, // without context
    JSONState.True, // so we've found the boolean true, and
    [null], // stay without context
  ),
  // Close false (false start)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.False, // we find the letter f
    null, // without context
    JSONState.False, // so we've found the boolean false, and
    [null], // stay without context
  ),
  // Close false (null start)
  new JSONStep(
    JSONState.False, // Value is the boolean false, and
    JSONTokenType.Null, // we find the letter n
    null, // without context
    JSONState.Null, // so we've found the primitive null, and
    [null], // stay without context
  ),
];

const nullTransitions: Array<
  PDATransition<JSONState | "key" | null, JSONTokenType>
> = [
  // Open null
  new JSONStep(
    null, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    null, // without context
    JSONState.Null, // so we've found the primitive null, and
    [null], // stay without context
  ),
  // Close null (whitespace)
  new JSONStep(
    JSONState.Null, // Value is the primitive null, and
    JSONTokenType.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [null], // stay without context
  ),
  // Close null (object start)
  new JSONStep(
    JSONState.Null, // Value is the primitive null, and
    JSONTokenType.LBrace, // we find a left brace
    null, // without context
    JSONState.Object, // so we have found an object, and
    [JSONState.Object], // step inside the object
  ),
  // Close null (array start)
  new JSONStep(
    JSONState.Null, // Value is the primitive null, and
    JSONTokenType.LBracket, // we find a left bracket
    null, // without context
    JSONState.Array, // so we've found an array, and
    [JSONState.Array], // step inside the array
  ),
  // Close null (string start)
  new JSONStep(
    JSONState.Null, // Value is the primitive null, and
    JSONTokenType.String, // we find a quotation mark
    null, // without context
    JSONState.String, // so we've found a string, and
    [null], // stay without context
  ),
  // Close null (number start)
  new JSONStep(
    JSONState.Null, // Value is the primitive null, and
    JSONTokenType.Number, // we find a number
    null, // without context
    JSONState.Number, // so we've found a true value, and
    [null], // stay without context
  ),
  // Close null (true start)
  new JSONStep(
    JSONState.Null, // Value is the primitive null, and
    JSONTokenType.True, // we find the letter t
    null, // without context
    JSONState.True, // so we've found the boolean true, and
    [null], // stay without context
  ),
  // Close null (false start)
  new JSONStep(
    JSONState.Null, // Value is the primitive null, and
    JSONTokenType.False, // we find the letter f
    null, // without context
    JSONState.False, // so we've found the boolean false, and
    [null], // stay without context
  ),
  // Close null (null start)
  new JSONStep(
    JSONState.Null, // Value is the primitive null, and
    JSONTokenType.Null, // we find the letter n
    null, // without context
    JSONState.Null, // so we've found the primitive null, and
    [null], // stay without context
  ),
];

new JSONPDA(
  JSONFSM,
  [
    ...objectTransitions,
    ...arrayTransitions,
    ...stringTransitions,
    ...numberTransitions,
    ...trueTransitions,
    ...falseTransitions,
    ...nullTransitions,
  ],
  null,
);

export function parseStream(
  stream:
    | ReadableStream
    | EventSource
    | WebSocket
    | AsyncIterable<string | Uint8Array | ArrayBuffer>,
): void {
  const processor = StreamProcessorFactory.create(stream);
  throw new Error("parseStream not yet implemented");
}
