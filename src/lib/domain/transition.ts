/**
 * TODO
 * - [ ] Emit error event for unexpected Trigger, e.g. Trigger.Comma when waiting for a value inside an Value.Object
 */
export enum Value {
  Object = "OBJECT",
  Array = "ARRAY",
  String = "STRING",
  Number = "NUMBER",
  True = "TRUE",
  False = "FALSE",
  Null = "NULL",
}

export enum Trigger {
  ObjectOpen = "{",
  ObjectClose = "}",
  ArrayOpen = "[",
  ArrayClose = "]",
  Colon = ":",
  Comma = ",",
  String = '"',
  Escape = "\\",
  Number = "-0123456789",
  True = "t",
  False = "f",
  Null = "n",
  Whitespace = " \n\r\t",
}

class Transition {
  constructor(
    public currentState: Value | "key" | null,
    public inputSymbol: Trigger,
    public stackTop: Value | null,
    public nextState: Value | "key" | null,
    public stackPush: Array<Value>,
  ) {}
}

class PDA {
  private transitions: Map<string, Transition> = new Map();
  private stack: Array<Value> = [];
  private state: Value | "key" | null = null;

  constructor(transitions: Array<Transition> = []) {
    for (const transition of transitions) {
      this.transitions.set(
        `currentState: ${transition.currentState}, inputSymbol: ${transition.inputSymbol}, stackTop: ${transition.stackTop}`,
        transition,
      );
    }
  }

  step(trigger: Trigger): boolean {
    const stackTop = this.stack.pop() || null;
    const compositeKey = `currentState: ${this.state}, inputSymbol: ${trigger}, stackTop: ${stackTop}`;
    const transition = this.transitions.get(compositeKey);

    if (!transition) {
      throw new Error(`No transition for ${compositeKey}`);
    }

    this.state = transition.nextState;
    this.stack.push(...transition.stackPush);

    return true;
  }
}

const objectTransitions: Array<Transition> = [
  // Open object (JSON element is an object)
  new Transition(
    null, // Value is the absence of context, and
    Trigger.ObjectOpen, // we find a left brace
    null, // without context,
    null, // so the next value is the object, and
    [Value.Object], // we step inside the object
  ),
  // Close object
  new Transition(
    Value.Object, // We're waiting for a value, and
    Trigger.ObjectClose, // we find a right brace
    Value.Object, // inside an object,
    null, // so the next value is the parent, and
    [], // we return to the parent
  ),
  // Close object fail-safe
  new Transition(
    null, // Value is the object, and
    Trigger.ObjectClose, // we find a right brace
    Value.Object, // inside an object,
    null, // so the next value is the parent, and
    [], // we return to the parent
  ),
  // Open object key
  new Transition(
    null, // Value is the object, and
    Trigger.String, // we find a quotation mark
    Value.Object, // inside an object,
    "key", // so we've found a key, and
    [Value.Object], // stay inside the object
  ),
  // Escape in object key
  new Transition(
    "key", // Value is the key, and
    Trigger.Escape, // we find a reverse solidus
    Value.Object, // inside an object,
    "key", // so we continue parsing the key, and
    [Value.Object], // stay inside the object
  ),
  // Close object key
  new Transition(
    "key", // Value is the key, and
    Trigger.String, // we find a quotation mark
    Value.Object, // inside an object,
    null, // so next value is the object, and
    [Value.Object], // stay inside the object
  ),
  // Open object value
  new Transition(
    null, // Value is the object, and
    Trigger.Colon, // we find a colon
    Value.Object, // inside an object,
    Value.Object, // so we wait for a value, and
    [Value.Object], // stay inside the object
  ),
  // Close object value
  new Transition(
    Value.Object, // We're waiting for a value, and
    Trigger.Comma, // we find a comma
    Value.Object, // inside an object,
    null, // so we return to the object to look for a key, and
    [Value.Object], // stay inside the object
  ),
  // Open object value: object
  new Transition(
    Value.Object, // We're waiting for a value, and
    Trigger.ObjectOpen, // we find a left brace
    Value.Object, // inside an object
    null, // so the next value is the new object, and
    [Value.Object, Value.Object], // we step inside the new object
  ),
  /* Close object value: object (duplicates close object)
  new Transition(
    Value.Object, // Value is object, and
    Trigger.ObjectClose, // we find a right brace
    Value.Object, // inside an object,
    null, // so we set the value to null, and
    [] // return to the parent
  ),
  */
  // Open object value: array
  new Transition(
    null, // We're waiting for a value, and
    Trigger.ArrayOpen, // we find a left bracket
    Value.Object, // inside an object
    Value.Array, // so we're waiting for a value, and
    [Value.Object, Value.Array], // step inside the array
  ),
  /* Close object value: array (duplicates close empty array)
  new Transition(
    null, // We're waiting for a value, and
    Trigger.ArrayClose, // we find a right bracket
    Value.Array, // inside an array,
    null, // so we set the value to null, and
    [] // return to the parent
  ),
  */
  // Open object value: string
  new Transition(
    Value.Object, // We're waiting for a value, and
    Trigger.String, // we find a quotation mark
    Value.Object, // inside an object
    Value.String, // so the next Value is a string, and
    [Value.Object], // we stay inside the object
  ),
  // Open object value: string escape
  new Transition(
    Value.String, // Value is a string, and
    Trigger.Escape, // we find a reverse solidus
    Value.Object, // inside an object
    Value.String, // so the next Value is a string, and
    [Value.Object], // we stay inside the object
  ),
  // Close string object: string
  new Transition(
    Value.String, // Value is a string, and
    Trigger.String, // we find a quotation mark
    Value.Object, // inside an object,
    null, // so we've finished parsing the value, await Trigger.Comma, or Trigger.ObjectClose, and
    [Value.Object], // stay inside the object
  ),
  // Open object value: number
  new Transition(
    Value.Object, // We're waiting for a value, and
    Trigger.Number, // we find a number
    Value.Object, // inside an object
    Value.Number, // so the next Value is a number, and
    [Value.Object], // we stay inside the object
  ),
  // Close object value: number (whitespace)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.Whitespace, // we find a whitespace
    Value.Object, // inside an object,
    null, // so we've finished parsing the value, await Trigger.Comma, or Trigger.ObjectClose, and
    [Value.Object], // stay inside the object
  ),
  // Close object value: number (comma)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.Comma, // we find a comma
    Value.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [Value.Object], // stay inside the object
  ),
  // Close object value: number (object close)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.ObjectClose, // we find a right brace
    Value.Object, // inside an object,
    null, // so the next value is the parent, and
    [], // we return to the parent
  ),
  // Open object value: true
  new Transition(
    Value.Object, // We're waiting for a value, and
    Trigger.True, // we find the letter t
    Value.Object, // inside an object
    Value.True, // so the next value is the boolean true, and
    [Value.Object], // we stay inside the object
  ),
  // Close object value: true (whitespace)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.Whitespace, // we find a whitespace
    Value.Object, // inside an object,
    null, // so we've finished parsing the value, await Trigger.Comma, or Trigger.ObjectClose, and
    [Value.Object], // stay inside the object
  ),
  // Close object value: true (comma)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.Comma, // we find a comma
    Value.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [Value.Object], // stay inside the object
  ),
  // Close object value: true (object close)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.ObjectClose, // we find a right brace
    Value.Object, // inside an object,
    null, // so the next value is the parent, and
    [], // we return to the parent
  ),
  // Open object value: false
  new Transition(
    Value.Object, // We're waiting for a value, and
    Trigger.False, // we find the letter f
    Value.Object, // inside an object
    Value.False, // so the next value is the boolean false, and
    [Value.Object], // we stay inside the object
  ),
  // Close object value: false (whitespace)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.Whitespace, // we find a whitespace
    Value.Object, // inside an object,
    null, // so we've finished parsing the value, await Trigger.Comma, or Trigger.ObjectClose, and
    [Value.Object], // stay inside the object
  ),
  // Close object value: false (comma)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.Comma, // we find a comma
    Value.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [Value.Object], // stay inside the object
  ),
  // Close object value: false (object close)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.ObjectClose, // we find a right brace
    Value.Object, // inside an object,
    null, // so the next value is the parent, and
    [], // we return to the parent
  ),
  // Open object value: null
  new Transition(
    Value.Object, // We're waiting for a value, and
    Trigger.Null, // we find the letter n
    Value.Object, // inside an object
    Value.Null, // so the next value is the primitive null, and
    [Value.Object], // we stay inside the object
  ),
  // Close object value: null (whitespace)
  new Transition(
    Value.Null, // Value is null, and
    Trigger.Whitespace, // we find a whitespace
    Value.Object, // inside an object,
    null, // so we've finished parsing the value, await Trigger.Comma, or Trigger.ObjectClose, and
    [Value.Object], // stay inside the object
  ),
  // Close object value: null (comma)
  new Transition(
    Value.Null, // Value is null, and
    Trigger.Comma, // we find a comma
    Value.Object, // inside an object,
    null, // so we return to the parent object to look for a key, and
    [Value.Object], // stay inside the object
  ),
  // Close object value: null (object close)
  new Transition(
    Value.Null, // Value is null, and
    Trigger.ObjectClose, // we find a right brace
    Value.Object, // inside an object,
    null, // so the next value is the parent, and
    [], // we return to the parent
  ),
];

const arrayTransitions: Array<Transition> = [
  // Open array (JSON element is an array)
  new Transition(
    null, // We're waiting for a value, and
    Trigger.ArrayOpen, // we find a left bracket
    null, // without context,
    Value.Array, // so we're waiting for a value, and
    [Value.Array], // step inside the array
  ),
  // Close array
  new Transition(
    Value.Array, // We're waiting for a value, and
    Trigger.ArrayClose, // we find a right bracket
    Value.Array, // inside an array,
    null, // so the next value is the parent, and
    [], // we return to the parent
  ),
  // Close array fail-safe
  new Transition(
    null, // We have finished parsing an element, and
    Trigger.ArrayClose, // we find a right bracket
    Value.Array, // inside an array,
    null, // so the next value is the parent, and
    [], // we return to the parent
  ),
  /* Open array element (N/A: elements are open by default)
  new Transition(...),
  */
  // Close array element
  new Transition(
    null, // We have finished parsing an element, and
    Trigger.Comma, // we find a comma,
    Value.Array, // inside an array,
    Value.Array, // so we're waiting for the next value, and
    [Value.Array], // stay inside the array
  ),
  // Open array element: array
  new Transition(
    Value.Array, // We're waiting for a value, and
    Trigger.ArrayOpen, // we find a left bracket
    Value.Array, // inside an array,
    Value.Array, // so we're waiting for a value in the new array, and
    [Value.Array, Value.Array], // step inside the new array
  ),
  /* Close array element: array (duplicates close empty array)
  new Transition(
    null, // We're waiting for a value, and
    Trigger.ArrayClose, // we find a right bracket
    Value.Array, // inside an array,
    null, // so we set the value to null, and
    [] // return to the parent
  ),
  */
  // Open array element: object
  new Transition(
    Value.Array, // We're waiting for a value, and
    Trigger.ObjectOpen, // we find a left brace
    Value.Array, // inside an array,
    null, // so the next value is the new object, and
    [Value.Array, Value.Object], // step inside the new object
  ),
  /* Close array element: object
  new Transition(
    ..., // In any state,
    Trigger.ObjectClose, // we find a right bracket
    Value.Object, // inside an object,
    null, // so we set the value to null, and
    [] // return to the parent
  ),
  */
  // Open array element: string
  new Transition(
    Value.Array, // We're waiting for a value, and
    Trigger.String, // we find a quotation mark
    Value.Array, // inside an array,
    Value.String, // so we've found a string, and
    [Value.Array], // stay inside the array
  ),
  // Open array element: string escape
  new Transition(
    Value.String, // Value is a string, and
    Trigger.Escape, // we find a reverse solidus
    Value.Array, // inside an array
    Value.String, // so the next Value is a string, and
    [Value.Array], // we stay inside the array
  ),
  // Close array element: string
  new Transition(
    Value.String, // Value is a string, and
    Trigger.String, // we find a quotation mark
    Value.Array, // inside an array,
    null, // so we've finished parsing the element, await Trigger.Comma, or Trigger.ArrayClose, and
    [Value.Array], // stay inside the array
  ),
  // Open array element: number
  new Transition(
    Value.Array, // We're waiting for a value, and
    Trigger.Number, // we find a number
    Value.Array, // inside an array
    Value.Number, // so the next Value is a number, and
    [Value.Array], // we stay inside the array
  ),
  // Close object value: number (whitespace)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.Whitespace, // we find a whitespace
    Value.Array, // inside an array,
    null, // so we've finished parsing the element, await Trigger.Comma, or Trigger.ArrayClose, and
    [Value.Array], // stay inside the array
  ),
  // Close array element: number (comma)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.Comma, // we find a comma
    Value.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [Value.Array], // stay inside the array
  ),
  // Close array element: number (array close)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.ArrayClose, // we find a right bracket
    Value.Array, // inside an array,
    null, // so we set the value to null, and
    [], // return to the parent
  ),
  // Open array element: true
  new Transition(
    Value.Array, // We're waiting for a value, and
    Trigger.True, // we find the letter t
    Value.Array, // inside an array
    Value.True, // so the next value is the boolean true, and
    [Value.Array], // we stay inside the array
  ),
  // Close array element: true (whitespace)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.Whitespace, // we find a whitespace
    Value.Array, // inside an array,
    null, // so we've finished parsing the element, await Trigger.Comma, or Trigger.ArrayClose, and
    [Value.Array], // stay inside the array
  ),
  // Close array element: true (comma)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.Comma, // we find a comma
    Value.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [Value.Array], // stay inside the array
  ),
  // Close array element: true (array close)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.ArrayClose, // we find a right bracket
    Value.Array, // inside an array,
    null, // so we set the value to null, and
    [], // return to the parent
  ),
  // Open array element: false
  new Transition(
    Value.Array, // We're waiting for a value, and
    Trigger.False, // we find the letter f
    Value.Array, // inside an array
    Value.False, // so the next value is the boolean false, and
    [Value.Array], // we stay inside the array
  ),
  // Close array element: false (whitespace)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.Whitespace, // we find a whitespace
    Value.Array, // inside an array,
    null, // so we've finished parsing the element, await Trigger.Comma, or Trigger.ArrayClose, and
    [Value.Array], // stay inside the array
  ),
  // Close array element: false (comma)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.Comma, // we find a comma
    Value.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [Value.Array], // stay inside the array
  ),
  // Close array element: false (array close)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.ArrayClose, // we find a right bracket
    Value.Array, // inside an array,
    null, // so we set the value to null, and
    [], // return to the parent
  ),
  // Open array element: null
  new Transition(
    Value.Array, // We're waiting for a value, and
    Trigger.Null, // we find the letter n
    Value.Array, // inside an array
    Value.Null, // so the next value is the primitive null, and
    [Value.Array], // we stay inside the array
  ),
  // Close array element: null (whitespace)
  new Transition(
    Value.Null, // Value is null, and
    Trigger.Whitespace, // we find a whitespace
    Value.Array, // inside an array,
    null, // so we've finished parsing the element, await Trigger.Comma, or Trigger.ArrayClose, and
    [Value.Array], // stay inside the array
  ),
  // Close array element: null (comma)
  new Transition(
    Value.Null, // Value is null, and
    Trigger.Comma, // we find a comma
    Value.Array, // inside an array,
    null, // so we've finished parsing the element, are waiting for a value, and
    [Value.Array], // stay inside the array
  ),
  // Close array element: null (array close)
  new Transition(
    Value.Null, // Value is null, and
    Trigger.ArrayClose, // we find a right bracket
    Value.Array, // inside an array,
    null, // so we set the value to null, and
    [], // return to the parent
  ),
];

const stringTransitions = [
  // Open string (JSON element is a string)
  new Transition(
    null, // We're waiting for a value, and
    Trigger.String, // we find a quotation mark
    null, // without context,
    Value.String, // so we've found a string, and
    [], // stay without context
  ),
  // Close string
  new Transition(
    Value.String, // Value is a string, and
    Trigger.String, // we find a quotation mark
    null, // without context
    null, // so we set the value to null, and
    [], // stay without context
  ),
  // Open string escape
  new Transition(
    Value.String, // Value is a string, and
    Trigger.Escape, // we find an escape character
    null, // without context
    Value.String, // so we return to the string, and
    [], // stay without context
  ),
];

const numberTransitions = [
  // Open number
  new Transition(
    null, // We're waiting for a value, and
    Trigger.Number, // we find a number
    null, // without context
    Value.Number, // so we've found a number, and
    [], // stay without context
  ),
  // Close number (whitespace)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [], // stay without context
  ),
  // Close number (object start)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.ObjectOpen, // we find a left brace
    null, // without context
    Value.Object, // so we have found an object, and
    [Value.Object], // step inside the object
  ),
  // Close number (array start)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.ArrayOpen, // we find a left bracket
    null, // without context
    Value.Array, // so we've found an array, and
    [Value.Array], // step inside the array
  ),
  // Close number (string start)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.String, // we find a quotation mark
    null, // without context
    Value.String, // so we've found a string, and
    [], // stay without context
  ),
  // Close number (true start)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.True, // we find the letter t
    null, // without context
    Value.True, // so we've found the boolean true, and
    [], // stay without context
  ),
  // Close number (false start)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.False, // we find the letter f
    null, // without context
    Value.False, // so we've found the boolean false, and
    [], // stay without context
  ),
  // Close number (null start)
  new Transition(
    Value.Number, // Value is a number, and
    Trigger.Null, // we find the letter n
    null, // without context
    Value.Null, // so we've found the primitive null, and
    [], // stay without context
  ),
];

const trueTransitions = [
  // Open true
  new Transition(
    null, // We're waiting for a value, and
    Trigger.True, // we find the letter t
    null, // without context
    Value.True, // so we've found the boolean true, and
    [], // stay without context
  ),
  // Close true (whitespace)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [], // stay without context
  ),
  // Close true (object start)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.ObjectOpen, // we find a left brace
    null, // without context
    Value.Object, // so we have found an object, and
    [Value.Object], // step inside the object
  ),
  // Close true (array start)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.ArrayOpen, // we find a left bracket
    null, // without context
    Value.Array, // so we've found an array, and
    [Value.Array], // step inside the array
  ),
  // Close true (string start)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.String, // we find a quotation mark
    null, // without context
    Value.String, // so we've found a string, and
    [], // stay without context
  ),
  // Close true (number start)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.Number, // we find a number
    null, // without context
    Value.Number, // so we've found a number, and
    [], // stay without context
  ),
  // Close true (true start)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.True, // we find the letter t
    null, // without context
    Value.True, // so we've found a true value, and
    [], // stay without context
  ),
  // Close true (false start)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.False, // we find the letter f
    null, // without context
    Value.False, // so we've found a false value, and
    [], // stay without context
  ),
  // Close true (null start)
  new Transition(
    Value.True, // Value is the boolean true, and
    Trigger.Null, // we find the letter n
    null, // without context
    Value.Null, // so we've found the primitive null, and
    [], // stay without context
  ),
];

const falseTransitions = [
  // Open false
  new Transition(
    null, // We're waiting for a value, and
    Trigger.False, // we find the letter f
    null, // without context
    Value.False, // so we've found the boolean false, and
    [], // stay without context
  ),
  // Close false (whitespace)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [], // stay without context
  ),
  // Close false (object start)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.ObjectOpen, // we find a left brace
    null, // without context
    Value.Object, // so we have found an object, and
    [Value.Object], // step inside the object
  ),
  // Close false (array start)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.ArrayOpen, // we find a left bracket
    null, // without context
    Value.Array, // so we've found an array, and
    [Value.Array], // step inside the array
  ),
  // Close false (string start)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.String, // we find a quotation mark
    null, // without context
    Value.String, // so we've found a string, and
    [], // stay without context
  ),
  // Close false (number start)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.Number, // we find a true keyword
    null, // without context
    Value.Number, // so we've found a true value, and
    [], // stay without context
  ),
  // Close false (true start)
  new Transition(
    Value.False, // Value is the boolean, and
    Trigger.True, // we find the letter t
    null, // without context
    Value.True, // so we've found the boolean true, and
    [], // stay without context
  ),
  // Close false (false start)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.False, // we find the letter f
    null, // without context
    Value.False, // so we've found the boolean false, and
    [], // stay without context
  ),
  // Close false (null start)
  new Transition(
    Value.False, // Value is the boolean false, and
    Trigger.Null, // we find the letter n
    null, // without context
    Value.Null, // so we've found the primitive null, and
    [], // stay without context
  ),
];

const nullTransitions = [
  // Open null
  new Transition(
    null, // We're waiting for a value, and
    Trigger.Null, // we find the letter n
    null, // without context
    Value.Null, // so we've found the primitive null, and
    [], // stay without context
  ),
  // Close null (whitespace)
  new Transition(
    Value.Null, // Value is the primitive null, and
    Trigger.Whitespace, // we find a whitespace
    null, // without context
    null, // so we set the value to null, and
    [], // stay without context
  ),
  // Close null (object start)
  new Transition(
    Value.Null, // Value is the primitive null, and
    Trigger.ObjectOpen, // we find a left brace
    null, // without context
    Value.Object, // so we have found an object, and
    [Value.Object], // step inside the object
  ),
  // Close null (array start)
  new Transition(
    Value.Null, // Value is the primitive null, and
    Trigger.ArrayOpen, // we find a left bracket
    null, // without context
    Value.Array, // so we've found an array, and
    [Value.Array], // step inside the array
  ),
  // Close null (string start)
  new Transition(
    Value.Null, // Value is the primitive null, and
    Trigger.String, // we find a quotation mark
    null, // without context
    Value.String, // so we've found a string, and
    [], // stay without context
  ),
  // Close null (number start)
  new Transition(
    Value.Null, // Value is the primitive null, and
    Trigger.Number, // we find a number
    null, // without context
    Value.Number, // so we've found a true value, and
    [], // stay without context
  ),
  // Close null (true start)
  new Transition(
    Value.Null, // Value is the primitive null, and
    Trigger.True, // we find the letter t
    null, // without context
    Value.True, // so we've found the boolean true, and
    [], // stay without context
  ),
  // Close null (false start)
  new Transition(
    Value.Null, // Value is the primitive null, and
    Trigger.False, // we find the letter f
    null, // without context
    Value.False, // so we've found the boolean false, and
    [], // stay without context
  ),
  // Close null (null start)
  new Transition(
    Value.Null, // Value is the primitive null, and
    Trigger.Null, // we find the letter n
    null, // without context
    Value.Null, // so we've found the primitive null, and
    [], // stay without context
  ),
];

new PDA([
  ...objectTransitions,
  ...arrayTransitions,
  ...stringTransitions,
  ...numberTransitions,
  ...trueTransitions,
  ...falseTransitions,
  ...nullTransitions,
]);

export class ASCIICharacterMatcher {
  private mask = new Uint8Array(128);

  constructor(characters: { [key: string]: string } | ArrayLike<string>) {
    // biome-ignore lint/complexity/noForEach: avoid unnecessary assignment
    Object.values(characters)
      .flatMap((value) => [...value])
      .map((value) => value.charCodeAt(0))
      .forEach((value) => {
        if (value > 127) {
          throw new Error("Non-ASCII character");
        }
        this.mask[value] = 1;
      });
  }

  findIndexOfFirstMatch(string: string): number {
    for (let i = 0; i < string.length; i++) {
      const code = string.charCodeAt(i);
      if (this.mask[code]) {
        return i;
      }
    }
    return -1;
  }
}
