import invariant from "tiny-invariant";
import { JSONChunk } from "~/lib/domain/chunk";
import { FSMTransition, type Lexer } from "~/lib/domain/lexer";
import { JSONTokenType } from "~/lib/domain/lexer";
import { JSONValue } from "~/lib/domain/lexer";
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
 * A JSON parser that consumes LexerTokens and produces JSONValues. The primary
 * concern of JSONParserUseCase is to maintain nesting metadata from the JSON
 * stream.
 */
export class JSONParser extends DPDA<
  typeof JSONTokenType,
  typeof JSONTokenType,
  typeof JSONValue
> {
  private lexer: Lexer<typeof JSONTokenType, typeof JSONTokenType>;
  private path: Array<string | number> = [];

  /**
   * Creates a JSON parser.
   * @param {Lexer} lexer The lexer instance used for tokenization.
   * @param {Array<JSONTransition>} transitions The transitions used for parsing.
   * @param {JSONTokenType} initialState The initial state of the parser.
   * @param {Array<JSONTokenType>} initialStack The initial stack of the parser.
   */
  constructor(
    lexer: Lexer<typeof JSONTokenType, typeof JSONTokenType>,
    transitions: Array<JSONTransition>,
    initialState: JSONTokenType,
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

  /**
   * Parses a chunk of JSON data from a stream.
   * @param {string} chunk A chunk of JSON data to parse.
   * @generator
   */
  async *parse(chunk: string): AsyncGenerator<JSONChunk> {
    const tokens = this.lexer.tokenise(chunk);

    for await (const token of tokens) {
      if (token.symbol) {
        const transition = this.transition(token.symbol);

        if (this.stack.length > this.path.length) {
          if (transition.stackTop === JSONValue.Array) {
            this.path.push(0);
            continue;
          }
          if (transition.stackTop === JSONValue.Object) {
            this.path.push("");
            continue;
          }
        }

        if (this.stack.length < this.path.length) {
          this.path.pop();
          continue;
        }

        // Handle array element transitions
        if (
          transition.stackTop === JSONValue.Array &&
          transition.inputSymbol === JSONTokenType.Comma
        ) {
          this.path[this.path.length - 1] += 1;
        }

        if (
          transition.stackTop === JSONValue.Object &&
          transition.currentState === JSONTokenType.String
        ) {
          this.keyBuffer += token.lexeme;
          continue;
        }

        if (
          transition.stackTop === JSONValue.Object &&
          transition.currentState === JSONTokenType.String &&
          transition.inputSymbol === JSONTokenType.String
        ) {
          this.path[this.path.length - 1] = this.keyBuffer;
          this.keyBuffer = "";
        }
      }

      yield new JSONChunk(token.lexeme, token.type, [...this.path]);
    }
  }
}
