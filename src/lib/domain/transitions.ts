import { JSONTokenType, JSONValue } from "~/lib/domain/lexer";
import { DPDATransition } from "./parser";

export class JSONTransition extends DPDATransition<
  JSONValue,
  JSONTokenType,
  JSONValue
> {}

/**
 * When currentState is Object, and stackTop is Object, we're looking for a key
 * When currentState is String, and stackTop is Object, we have a key
 * When currentState is String, and stackTop is String, we have a string value
 * When currentState is None, and stackTop is Object, we're looking for a value
 */
const objectTransitions: Array<JSONTransition> = [
  // Open object (JSON element is an object)
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.None, // without context,
    JSONValue.Object, // so we're looking for a key, and
    [JSONValue.None, JSONValue.Object], // we step inside the object
  ),
  // Close empty object
  new JSONTransition(
    JSONValue.Object, // We're waiting for a key, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // inside an object,
    JSONValue.None, // so we're looking for a value, and
    [], // we return to the parent
  ),
  // Close object (fail-safe)
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // inside an object,
    JSONValue.None, // so we're looking for a value, and
    [], // we return to the parent
  ),
  // Open object key
  new JSONTransition(
    JSONValue.Object, // We're waiting for a key, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Object, // inside an object,
    JSONValue.String, // so we've found a key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Escape in object key
  new JSONTransition(
    JSONValue.String, // Value is the key, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONValue.Object, // inside an object,
    JSONValue.String, // so we continue parsing the key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object key
  new JSONTransition(
    JSONValue.String, // Value is the key, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Object, // inside an object,
    JSONValue.None, // so we're looking for a value, and
    [JSONValue.Object], // stay inside the object
  ),
  // Open object value
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Colon, // we find a colon
    JSONValue.Object, // inside an object,
    JSONValue.None, // so we're looking for a value, and
    [JSONValue.Object], // stay inside the object
  ),
  // Close object value
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Object, // inside an object,
    JSONValue.Object, // so we're looking for a key, and
    [JSONValue.Object], // stay inside the object
  ),
  // Open object value: object
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.Object, // inside an object,
    JSONValue.Object, // so we're looking for a key, and
    [JSONValue.Object, JSONValue.Object], // we step inside the new object
  ),
  /* Close object value: object [duplicate]
  new Transition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.RBrace, // we find a right brace
    JSONState.Object, // inside an object,
    JSONTokenType.Whitespace, // so we're looking for a value, and
    [] // return to the parent
  ),
  */
  // Open object value: array
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.Object, // inside an object,
    JSONValue.None, // so we're looking for a value, and
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
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Object, // inside an object,
    JSONValue.String, // so the next value is a string, and
    [JSONValue.Object, JSONValue.String], // we stay inside the object
  ),
  /* Open object value: string escape [duplicate]
  new JSONTransition(
    JSONTokenType.String, // Value is a string, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONValue.String, // after the string,
    JSONValue.String, // so the next value is a string, and
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
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Digit, // we find a digit
    JSONValue.Object, // inside an object,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Object, JSONValue.Number], // we step inside the number
  ),
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Minus, // we find a minus sign
    JSONValue.Object, // inside an object,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Object, JSONValue.Number], // we step inside the number
  ),
  /* Close object value: number (whitespace) [duplicate]
  new JSONTransition(
    JSONTokenType.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Number, // after a number,
    JSONValue.None, // so await JSONTokenType.Comma, or JSONTokenType.RBrace, and
    [], // stay inside the object
  ),
  */
  // Close object value: number (comma)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Number, // after a number,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close object value: number (object close)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Number, // after a number,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open object value: true
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    JSONValue.Object, // inside an object,
    JSONValue.True, // so the next value is a true literal, and
    [JSONValue.Object, JSONValue.True], // we step inside the true literal
  ),
  /* Close object value: true (whitespace) [duplicate]
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.True, // after the true literal,
    JSONTokenType.Whitespace, // so await JSONTokenType.Comma, or JSONTokenType.RBrace, and
    [], // return to the parent
  ),
  */
  // Close object value: true (comma)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.True, // after the true literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close object value: true (object close)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.True, // after the true literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open object value: false
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    JSONValue.Object, // inside an object,
    JSONValue.False, // so the next value is a false literal, and
    [JSONValue.Object, JSONValue.False], // we step inside the false literal
  ),
  /* Close object value: false (whitespace) [duplicate]
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.False, // after the false literal,
    JSONValue.None, // so we await JSONTokenType.Comma, or JSONTokenType.RBrace, and
    [], // return to the parent
  ),
  */
  // Close object value: false (comma)
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.False, // after the false literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close object value: false (object close)
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Object, // after the false literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open object value: null
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.Object, // inside an object,
    JSONValue.Null, // so the next value is a null literal, and
    [JSONValue.Object, JSONValue.Null], // we step inside the null literal
  ),
  /* Close object value: null (whitespace) [duplicate]
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Null, // after the null literal,
    JSONValue.None, // so we await JSONTokenType.Comma, or JSONTokenType.RBrace, and
    [], // stay inside the object
  ),
  */
  // Close object value: null (comma)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Null, // after the null literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close object value: null (object close)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.RBrace, // we find a right brace
    JSONValue.Null, // after the null literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
];

const arrayTransitions: Array<JSONTransition> = [
  // Open array (JSON element is an array)
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.None, // without context,
    JSONValue.None, // so we're looking for a value, and
    [JSONValue.None, JSONValue.Array], // step inside the array
  ),
  // Close array
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Array, // inside an array,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  /* Open array element (N/A: elements are open by default)
  new Transition(...),
  */
  // Close array element
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Comma, // we find a comma,
    JSONValue.Array, // inside an array,
    JSONValue.None, // so we're looking for the next value, and
    [JSONValue.Array], // stay inside the array
  ),
  // Open array element: array
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.Array, // inside an array,
    JSONValue.None, // so we're looking for a value, and
    [JSONValue.Array, JSONValue.Array], // step inside the new array
  ),
  /* Close array element: array [duplicate]
  new Transition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONState.Array, // inside an array,
    JSONValue.None, // so we're looking for a value, and
    [] // return to the parent
  ),
  */
  // Open array element: object
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.Array, // inside an array,
    JSONValue.Object, // so we're looking for a key, and
    [JSONValue.Array, JSONValue.Object], // step inside the new object
  ),
  /* Close array element: object
  new Transition(
    ..., // In any state,
    JSONTokenType.RBrace, // we find a right bracket
    JSONState.Object, // inside an object,
    JSONValue.None, // so we're looking for a value, and
    [] // return to the parent
  ),
  */
  // Open array element: string
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Array, // inside an array,
    JSONValue.String, // so the next value is a string, and
    [JSONValue.Array, JSONValue.String], // we stay inside the array
  ),
  /* Open array element: string escape [duplicate]
  new JSONTransition(
    JSONValue.String, // Value is a string, and
    JSONTokenType.Escape, // we find a reverse solidus
    JSONValue.String, // inside the string,
    JSONValue.String, // so the next value is a string, and
    [JSONValue.String], // we stay inside the string
  ),
  */
  /* Close array element: string [duplicate]
  new JSONTransition(
    JSONValue.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.String, // inside the string,
    JSONValue.None, // so we await JSONTokenType.Comma, or JSONTokenType.RBracket, and
    [], // return to the parent
  ),
  */
  // Open array element: number
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Digit, // we find a digit
    JSONValue.Array, // inside an array
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Array, JSONValue.Number], // we step inside the number
  ),
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Minus, // we find a minus sign
    JSONValue.Array, // inside an array
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Array, JSONValue.Number], // we step inside the number
  ),
  /* Close object value: number (whitespace) [duplicate]
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Number, // after the number,
    JSONValue.None, // so we await JSONTokenType.Comma, or JSONTokenType.RBracket, and
    [], // we return to the parent
  ),
  */
  /* Close array element: number (comma) [duplicate]
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Number, // after a number,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  */
  // Close array element: number (array close)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Number, // after a number,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open array element: true
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    JSONValue.Array, // inside an array,
    JSONValue.True, // so the next value is a true literal, and
    [JSONValue.Array, JSONValue.True], // we step inside the true literal
  ),
  /* Close array element: true (whitespace) [duplicate]
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.True, // after the true literal,
    JSONValue.None, // so we await JSONTokenType.Comma, or JSONTokenType.RBracket, and
    [], // return to the parent
  ),
  */
  /* Close array element: true (comma) [duplicate]
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.True, // after the true literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  */
  // Close array element: true (array close)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.True, // after the true literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open array element: false
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    JSONValue.Array, // inside an array
    JSONValue.False, // so the next value is a false literal, and
    [JSONValue.Array, JSONValue.False], // we step inside the false literal
  ),
  /* Close array element: false (whitespace) [duplicate]
  new JSONTransition(
    JSONValue.False, // Value is the boolean false, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.False, // after the false literal,
    JSONValue.None, // so we await JSONTokenType.Comma, or JSONTokenType.RBracket, and
    [], // return to the parent
  ),
  */
  /* Close array element: false (comma) [duplicate]
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.False, // after the false literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  */
  // Close array element: false (array close)
  new JSONTransition(
    JSONValue.False, // Value is the false literal, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.False, // after the false literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open array element: null
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.Array, // inside an array
    JSONValue.Null, // so the next value is a null literal, and
    [JSONValue.Array, JSONValue.Null], // we step inside the null literal
  ),
  /* Close array element: null (whitespace) [duplicate]
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Null, // after the null literal,
    JSONValue.None, // so we await JSONTokenType.Comma, or JSONTokenType.RBracket, and
    [], // return to the parent
  ),
  */
  /* Close array element: null (comma) [duplicate]
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.Comma, // we find a comma
    JSONValue.Null, // after the null literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  */
  // Close array element: null (array close)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.RBracket, // we find a right bracket
    JSONValue.Null, // after the null literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
];

const stringTransitions: Array<JSONTransition> = [
  // Open string (JSON element is a string)
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.None, // without context,
    JSONValue.String, // so the next value is a string, and
    [JSONValue.None, JSONValue.String], // we step inside the string
  ),
  // Close string
  new JSONTransition(
    JSONValue.String, // Value is a string, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.String, // inside a string,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Open string escape
  new JSONTransition(
    JSONValue.String, // Value is a string, and
    JSONTokenType.Escape, // we find an escape character
    JSONValue.String, // inside a string,
    JSONValue.String, // so the value is still the string, and
    [JSONValue.String], // we stay inside the string
  ),
];

const numberTransitions: Array<JSONTransition> = [
  // Open number
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Digit, // we find a digit
    JSONValue.None, // without context,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.None, JSONValue.Number], // we step inside the number
  ),
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Minus, // we find a minus sign
    JSONValue.None, // without context,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.None, JSONValue.Number], // we step inside the number
  ),
  // Open number escape
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Exponential, // we find an exponential character
    JSONValue.Number, // inside a number,
    JSONValue.Number, // so the value is still the number, and
    [JSONValue.Number], // we stay inside the number
  ),
  // Close number (minus sign)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Minus, // we find a minus sign
    JSONValue.Number, // after a number,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Number], // we step inside the number
  ),
  // Close number (whitespace)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Number, // after a number,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close number (object start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.Number, // after a number,
    JSONValue.None, // we're looking for a key, and
    [JSONValue.Object], // step inside the object
  ),
  // Close number (array start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.Number, // after a number,
    JSONValue.None, // so we're looking for a value, and
    [JSONValue.Array], // step inside the array
  ),
  // Close number (string start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Number, // after a number,
    JSONValue.String, // so the next value is a string, and
    [JSONValue.String], // we step inside the string
  ),
  // Close number (true start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.True, // we find the letter t
    JSONValue.Number, // after a number,
    JSONValue.True, // so the next value is true literal, and
    [JSONValue.True], // we step inside the true literal
  ),
  // Close number (false start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.False, // we find the letter f
    JSONValue.Number, // after a number,
    JSONValue.False, // so the next value is false literal, and
    [JSONValue.False], // we step inside the false literal
  ),
  // Close number (null start)
  new JSONTransition(
    JSONValue.Number, // Value is a number, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.Number, // after a number,
    JSONValue.Null, // so the next value is null literal, and
    [JSONValue.Null], // we step inside the null literal
  ),
];

const trueTransitions: Array<JSONTransition> = [
  // Open true
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.True, // we find the letter t
    JSONValue.None, // without context,
    JSONValue.True, // so we've found a true literal, and
    [JSONValue.None, JSONValue.True], // step inside the true literal
  ),
  // Close true (whitespace)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.True, // after the true literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close true (object start)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.True, // after the true literal,
    JSONValue.Object, // so we're looking for a key, and
    [JSONValue.Object], // step inside the object
  ),
  // Close true (array start)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.True, // after the true literal,
    JSONValue.None, // so we're looking for a value, and
    [JSONValue.Array], // step inside the array
  ),
  // Close true (string start)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.True, // after the true literal,
    JSONValue.String, // so the next value is a string, and
    [JSONValue.String], // we step inside the string
  ),
  // Close true (number start)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.Digit, // we find a digit
    JSONValue.True, // after the true literal,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Number], // we step inside the number
  ),
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.Minus, // we find a minus sign
    JSONValue.True, // after the true literal,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Number], // we step inside the number
  ),
  // Close true (true start)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.True, // we find the letter t
    JSONValue.True, // after the true literal,
    JSONValue.True, // so the next value is a true literal, and
    [JSONValue.True], // we step inside the true literal
  ),
  // Close true (false start)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.False, // we find the letter f
    JSONValue.True, // after the true literal,
    JSONValue.False, // so the next value is a false literal, and
    [JSONValue.False], // we step inside the false literal
  ),
  // Close true (null start)
  new JSONTransition(
    JSONValue.True, // Value is true literal, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.True, // after the true literal,
    JSONValue.Null, // so the next value is a null literal, and
    [JSONValue.Null], // we step inside the null literal
  ),
];

const falseTransitions: Array<JSONTransition> = [
  // Open false
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.False, // we find the letter f
    JSONValue.None, // without context
    JSONValue.False, // so the next value is a false literal, and
    [JSONValue.None, JSONValue.False], // we step inside the false literal
  ),
  // Close false (whitespace)
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.False, // after the false literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close false (object start)
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.False, // after the false literal,
    JSONValue.Object, // so we're looking for a key, and
    [JSONValue.Object], // step inside the object
  ),
  // Close false (array start)
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.False, // after the false literal,
    JSONValue.None, // so we're looking for a value, and
    [JSONValue.Array], // step inside the array
  ),
  // Close false (string start)
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.False, // after the false literal,
    JSONValue.String, // so the next value is a string, and
    [JSONValue.String], // we step inside the string
  ),
  // Close false (number start)
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.Digit, // we find a digit
    JSONValue.False, // after the false literal,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Number], // we step inside the number
  ),
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.Minus, // we find a minus sign
    JSONValue.False, // after the false literal,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Number], // we step inside the number
  ),
  // Close false (true start)
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.True, // we find the letter t
    JSONValue.False, // after the false literal,
    JSONValue.True, // so the next value is a true literal, and
    [JSONValue.True], // we step inside the true literal
  ),
  // Close false (false start)
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.False, // we find the letter f
    JSONValue.False, // after the false literal,
    JSONValue.False, // so the next value is a false literal, and
    [JSONValue.False], // we step inside the false literal
  ),
  // Close false (null start)
  new JSONTransition(
    JSONValue.False, // Value is false literal, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.False, // after the false literal,
    JSONValue.Null, // so the next value is a null literal, and
    [JSONValue.Null], // we step inside the null literal
  ),
];

const nullTransitions: Array<JSONTransition> = [
  // Open null
  new JSONTransition(
    JSONValue.None, // We're waiting for a value, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.None, // without context
    JSONValue.Null, // so the next value is a null literal, and
    [JSONValue.None, JSONValue.Null], // we step inside the null literal
  ),
  // Close null (whitespace)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.Whitespace, // we find a whitespace
    JSONValue.Null, // after the null literal,
    JSONValue.None, // so we're looking for a value, and
    [], // return to the parent
  ),
  // Close null (object start)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.LBrace, // we find a left brace
    JSONValue.Null, // after the null literal,
    JSONValue.Object, // so we're looking for a key, and
    [JSONValue.Object], // step inside the object
  ),
  // Close null (array start)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.LBracket, // we find a left bracket
    JSONValue.Null, // after the null literal,
    JSONValue.None, // so we're looking for a value, and
    [JSONValue.Array], // step inside the array
  ),
  // Close null (string start)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.String, // we find a quotation mark
    JSONValue.Null, // after the null literal,
    JSONValue.String, // so the next value is a string, and
    [JSONValue.String], // we step inside the string
  ),
  // Close null (number start)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.Digit, // we find a digit
    JSONValue.Null, // after the null literal,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Number], // we step inside the number
  ),
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.Minus, // we find a minus sign
    JSONValue.Null, // after the null literal,
    JSONValue.Number, // so the next value is a number, and
    [JSONValue.Number], // we step inside the number
  ),
  // Close null (true start)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.True, // we find the letter t
    JSONValue.Null, // after the null literal,
    JSONValue.True, // so the next value is a true literal, and
    [JSONValue.True], // we step inside the true literal
  ),
  // Close null (false start)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.False, // we find the letter f
    JSONValue.Null, // after the null literal,
    JSONValue.False, // so the next value is a false literal, and
    [JSONValue.False], // we step inside the false literal
  ),
  // Close null (null start)
  new JSONTransition(
    JSONValue.Null, // Value is null literal, and
    JSONTokenType.Null, // we find the letter n
    JSONValue.Null, // after the null literal,
    JSONValue.Null, // so the next value is a null literal, and
    [JSONValue.Null], // we step inside the null literal
  ),
];

export const JSONTransitions: Array<JSONTransition> = [
  ...objectTransitions,
  ...arrayTransitions,
  ...stringTransitions,
  ...numberTransitions,
  ...trueTransitions,
  ...falseTransitions,
  ...nullTransitions,
];
