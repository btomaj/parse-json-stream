import { JSONChunk } from "~/lib/domain/chunk";
import {
  FSMTransition,
  JSONSymbol,
  JSONValue,
  type Lexer,
} from "~/lib/domain/lexer";
import type { JSONTransition } from "./transitions";

export class DPDATransition<State, Input, Stack> extends FSMTransition<
  State,
  Input
> {
  constructor(
    currentState: State,
    inputSymbol: Input,
    public stackTop: Stack,
    nextState: State,
    public stackPush: Array<Stack>,
  ) {
    super(currentState, inputSymbol, nextState);
  }
}

export abstract class DPDA<
  State extends Record<string, string | number | symbol>,
  Input extends Record<string, string | symbol>,
  Stack extends Record<string, string | number | symbol>,
> {
  private _state: State[keyof State];
  protected readonly stack: Array<Stack[keyof Stack]> = [];
  private readonly transitions: Map<
    State[keyof State],
    Map<
      Input[keyof Input],
      Map<
        Stack[keyof Stack],
        DPDATransition<
          State[keyof State],
          Input[keyof Input],
          Stack[keyof Stack]
        >
      >
    >
  > = new Map();

  constructor(
    transitions: Array<
      DPDATransition<State[keyof State], Input[keyof Input], Stack[keyof Stack]>
    >,
    initialState: State[keyof State],
    initialStack: Array<Stack[keyof Stack]>,
  ) {
    this._state = initialState;

    for (const transition of transitions) {
      let stateTransitions = this.transitions.get(transition.currentState);
      if (!stateTransitions) {
        stateTransitions = new Map();
        this.transitions.set(transition.currentState, stateTransitions);
      }

      let stackTransitions = stateTransitions.get(transition.inputSymbol);
      if (!stackTransitions) {
        stackTransitions = new Map();
        stateTransitions.set(transition.inputSymbol, stackTransitions);
      }

      stackTransitions.set(transition.stackTop, transition);
    }

    this.stack.push(...initialStack);
  }

  get state(): State[keyof State] {
    return this._state;
  }

  transition(
    inputSymbol: Input[keyof Input],
  ): DPDATransition<
    State[keyof State],
    Input[keyof Input],
    Stack[keyof Stack]
  > {
    const stackTop = this.stack.pop();
    if (typeof stackTop === "undefined") {
      throw new Error(
        `State stack is empty on transition from currentState: ${this.state.toString()} with inputSymbol: ${inputSymbol.toString()}`,
      );
    }

    const transition = this.transitions
      .get(this.state)
      ?.get(inputSymbol)
      ?.get(stackTop);
    if (!transition) {
      this.stack.push(stackTop);
      throw new Error(
        `No transition for currentState: ${this.state.toString()}, inputSymbol: ${inputSymbol.toString()}, stackTop: ${stackTop.toString()}`,
      );
    }

    this._state = transition.nextState;
    this.stack.push(...transition.stackPush);

    return transition;
  }
}

/**
 * Parser passes chunk to Lexer. Lexer returns tokens. Parser parses the tokens;
 * maintaining Object and Array metadata, and returning primitives with
 * metadata. E.g. ["key", 0, "key"], and "string...".
 */
/**
 * A JSON parser that consumes LexerTokens and produces JSONChunks. The primary
 * concern of JSONParser is to maintain nesting metadata from the JSON stream.
 */
export class JSONParser extends DPDA<
  typeof JSONValue,
  typeof JSONSymbol,
  typeof JSONValue
> {
  private lexer: Lexer<typeof JSONValue, typeof JSONSymbol>;
  private path: Array<string | number> = [];

  /**
   * Creates a JSON parser.
   * @param {Lexer} lexer The lexer instance used for tokenization.
   * @param {Array<JSONTransition>} transitions The transitions used for parsing.
   * @param {JSONTokenType} initialState The initial state of the parser.
   * @param {Array<JSONTokenType>} initialStack The initial stack of the parser.
   */
  constructor(
    lexer: Lexer<typeof JSONValue, typeof JSONSymbol>,
    transitions: Array<JSONTransition>,
    initialState: JSONValue,
    initialStack: Array<JSONValue>,
  ) {
    super(transitions, initialState, initialStack);
    this.lexer = lexer;
  }

  /**
   * Buffers the current key until it has been streamed to completion.
   * @private
   */
  private keyBuffer = "";
  private isBufferingKey = false;

  /**
   * Parses a chunk of JSON data from a stream.
   * @param {string} chunk A chunk of JSON data to parse.
   * @generator
   */
  *parse(chunk: string): Generator<JSONChunk> {
    const tokens = this.lexer.tokenise(chunk);

    for (const token of tokens) {
      if (token.symbol) {
        this.transition(token.symbol);

        if (this.stack.length > this.path.length + 1) {
          if (this.stack[this.stack.length - 1] === JSONValue.Array) {
            this.path.push(0);
            continue;
          }
          if (this.stack[this.stack.length - 1] === JSONValue.Object) {
            this.path.push("");
            this.keyBuffer = "";
            this.isBufferingKey = true;
            continue;
          }
        } else if (this.stack.length < this.path.length) {
          this.path.pop();
          continue;
        }

        if (
          token.symbol === JSONSymbol.Comma &&
          this.stack[this.stack.length - 1] === JSONValue.Array
        ) {
          (this.path[this.path.length - 1] as number) += 1;
        } else if (
          token.symbol === JSONSymbol.Comma &&
          this.stack[this.stack.length - 1] === JSONValue.Object
        ) {
          this.keyBuffer = "";
          this.isBufferingKey = true;
        } else if (
          token.symbol === JSONSymbol.Colon &&
          this.stack[this.stack.length - 1] === JSONValue.Object
        ) {
          this.path[this.path.length - 1] = this.keyBuffer;
          this.isBufferingKey = false;
        }

        continue;
      }

      if (this.isBufferingKey && token.type === JSONValue.String) {
        this.keyBuffer += token.buffer.slice(token.start, token.end);
        continue;
      }

      yield new JSONChunk(
        token.buffer.slice(token.start, token.end),
        token.type,
        [...this.path],
      );
    }
  }
}
