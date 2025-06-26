import { JSONChunk } from "~/lib/domain/chunk";
import { FSMTransition, type Lexer } from "~/lib/domain/lexer";
import type { JSONTokenType } from "~/lib/domain/lexer";
import type { JSONValue } from "~/lib/domain/lexer";
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

  async *parse(chunk: string): AsyncGenerator<JSONChunk> {
    const tokens = this.lexer.tokenise(chunk);

    // TODO: Manage depth state using dpda
    for await (const token of tokens) {
      this.transition(token.type);
      yield new JSONChunk(token.lexeme, token.type, [...this.path]);
    }
  }
}
