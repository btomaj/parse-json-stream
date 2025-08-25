import { JSONChunk } from "~/lib/domain/chunk";
import {
  FSMTransition,
  JSONSymbol,
  JSONValue,
  type Lexer,
} from "~/lib/domain/lexer";
import type { JSONTransition } from "~/lib/domain/transitions";

/**
 * Represents a transition in a Deterministic Pushdown Automaton (DPDA).
 *
 * Extends {@link FSMTransition} to add stack operations, enabling context-free
 * parsing. In addition to the current state, input symbol, and next state
 * defined in an FMSTransition, each transition specifies what must be on top of
 * the stack for a transition, and what elements to push after the transition.
 *
 * @extends FSMTransition
 * @template State The before and after states
 * @template Input The input symbols
 * @template Stack The stack symbols
 */

export class DPDATransition<State, Input, Stack> extends FSMTransition<
  State,
  Input
> {
  /**
   * Creates a new DPDA transition.
   *
   * @param currentState The state the machine must be in for this transition to apply
   * @param inputSymbol The input symbol that triggers this transition
   * @param stackTop The stack symbol that must be on top of the stack for this transition to apply (that is popped off the stack in the transiton)
   * @param nextState The state that the automaton will move to after the transition
   * @param stackPush Array of stack symbols to push onto the stack (empty array to push nothing)
   */
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

/**
 * Abstract base class for Deterministic Pushdown Automata.
 *
 * Provides the core functionality for hierarchical state management and
 * transitions. Concrete implementations define specific transition tables and
 * behavior.
 *
 * In the theory, a DPDA extends finite state machines with a stack, enabling
 * the parsing of context-free languages. The stack maintains hierarchy, such as
 * nested object and array structures.
 *
 * @template State Possible states
 * @template Input Possible input symbols
 * @template Stack Possible stack symbols
 */
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

  /**
   * Creates a new Deterministic Pushdown Automaton.
   *
   * @param transitions Array of all possible transitions for this DPDA
   * @param initialState The initial state of the automaton
   * @param initialStack The initial contents of the stack
   */
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

  /**
   * Gets the current state of the pushdown automaton.
   *
   * @returns The current state value
   */
  get state(): State[keyof State] {
    return this._state;
  }

  /**
   * Performs a state transition based on the input symbol and stack top.
   *
   * @param inputSymbol The input symbol that triggers the transition
   * @returns The transition that was executed
   * @throws Error if the stack is empty or no valid transition exists
   */
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
 * A streaming JSON parser that processes lexical tokens and produces {@link JSONChunk}s.
 *
 * JSONParser is a Deterministic Pushdown Automaton that maintains parsing
 * context, enabling it to track nested object and array structures. It consumes
 * tokens from a {@link Lexer} and produces {@link JSONChunk} objects that
 * include both the parsed values and its location within the JSON structure.
 *
 * Key responsibilities:
 * - Maintain parsing state through nested JSON structures
 * - Track the current path within the JSON document
 * - Buffer object keys until complete
 * - Generate JSONChunk objects with accurate path metadata
 * - Handle streaming input where data may arrive in arbitrary chunks
 *
 * @example
 * ```typescript
 * const lexer = new JSONLexer(transitions, JSONValue.None);
 * const parser = new JSONParser(lexer, jsonTransitions, JSONValue.None, [JSONValue.None]);
 *
 * for (const chunk of parser.parse('{"users":[{"name":"John"}]}')) {
 *   console.log(`${chunk.path}: ${chunk.value} (${chunk.type})`);
 * }
 * // Output:
 * // $.users[0].name: "John" (string)
 * ```
 * @extends DPDA
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
   *
   * @param lexer The lexer instance used for tokenisation
   * @param transitions The DPDA transitions that define JSON parsing behavior
   * @param initialState The initial state of the parser (typically JSONValue.None)
   * @param initialStack The initial stack contents (typically [JSONValue.None])
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
   * Buffers the current object key until it has been streamed to completion.
   *
   * Object keys in JSON strings may be split across multiple tokens (especially
   * when escape sequences are involved), so we accumulate the key content
   * until the closing quote is encountered.
   *
   * @private
   */
  private keyBuffer = "";
  private isBufferingKey = false;

  /**
   * Parses a chunk of JSON data from a stream and yields {@link JSONChunk} objects.
   *
   * Processes tokens from the lexer, maintains parsing state through the DPDA,
   * and tracks the current path within the JSON structure. Handles:
   * - Nested objects and arrays
   * - Object key buffering across multiple tokens
   * - Path updates as the parser moves through the structure
   * - Generation of JSONChunk objects with accurate metadata
   *
   * The parser maintains context across multiple calls, allowing for true
   * streaming operation where JSON data can be processed incrementally.
   *
   * @param chunk A chunk of JSON data to parse
   * @yields {@link JSONChunk} objects representing parsed values with their paths
   *
   * @example
   * ```typescript
   * // Parse streaming JSON data
   * const chunks = [...parser.parse('{"name":"John","age":30}')];
   * // chunks[0]: JSONChunk with path="$.name", value="John", type=string
   * // chunks[1]: JSONChunk with path="$.age", value="30", type=number
   * ```
   * @generator
   */
  *parse(chunk: string): Generator<JSONChunk> {
    const tokens = this.lexer.tokenise(chunk);

    for (const token of tokens) {
      if (token.symbol) {
        this.transition(token.symbol);

        switch (token.symbol) {
          case JSONSymbol.LBrace:
            this.path.push("");
            this.isBufferingKey = true;
            continue;
          case JSONSymbol.Comma: {
            const stackTop = this.stack[this.stack.length - 1];
            if (stackTop === JSONValue.Object) {
              this.isBufferingKey = true;
              continue;
            }
            if (stackTop === JSONValue.Array) {
              (this.path[this.path.length - 1] as number) += 1;
            }
            continue;
          }
          case JSONSymbol.Colon:
            this.path[this.path.length - 1] = this.keyBuffer;
            this.keyBuffer = "";
            this.isBufferingKey = false;
            continue;
          case JSONSymbol.RBrace:
          case JSONSymbol.RBracket:
            this.path.pop();
            continue;
          case JSONSymbol.LBracket:
            this.path.push(0);
            continue;
        }
      }

      if (this.isBufferingKey && token.type === JSONValue.String) {
        this.keyBuffer += token.buffer.slice(token.start, token.end);
        continue;
      }

      yield new JSONChunk(token.buffer, token.start, token.end, token.type, [
        ...this.path,
      ]);
    }
  }
}
