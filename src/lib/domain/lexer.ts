import invariant from "tiny-invariant";

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
 * | `TRUE`       | `t`                   | True literal             |
 * | `FALSE`      | `f`                   | False literal            |
 * | `NULL`       | `n`                   | Null literal             |
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

export interface LexerToken<State, Input> {
  type: State[keyof State];
  lexeme: string;
  symbol?: Input[keyof Input];
}

export class FSMTransition<State, Input> {
  constructor(
    public readonly currentState: State,
    public readonly inputSymbol: Input,
    public readonly nextState: State,
  ) {}
}

export abstract class FSM<
  State extends Record<string, string | number | symbol>,
  Input extends Record<string, string | symbol>,
> {
  private _state: State[keyof State];
  protected transitions: Map<
    State[keyof State],
    Map<
      Input[keyof Input],
      FSMTransition<State[keyof State], Input[keyof Input]>
    >
  > = new Map();

  constructor(
    transitions: Array<FSMTransition<State[keyof State], Input[keyof Input]>>,
    initialState: State[keyof State],
  ) {
    for (const transition of transitions) {
      let stateTransitions = this.transitions.get(transition.currentState);
      if (!stateTransitions) {
        stateTransitions = new Map();
        this.transitions.set(transition.currentState, stateTransitions);
      }
      stateTransitions.set(transition.inputSymbol, transition);
    }

    this._state = initialState;
  }

  get state(): State[keyof State] {
    return this._state;
  }

  transition(
    inputSymbol: Input[keyof Input],
  ): FSMTransition<State[keyof State], Input[keyof Input]> {
    const transition = this.transitions.get(this.state)?.get(inputSymbol);
    if (!transition) {
      throw new Error(
        `No transition from state ${this.state.toString()} on ${inputSymbol.toString()}`,
      );
    }
    this._state = transition.nextState;
    return transition;
  }

  reset(state: State[keyof State]) {
    this._state = state;
  }
}

/**
 * TODO
 * - [ ] Determine what should be async
 */
export abstract class Lexer<
  State extends Record<string, string | number | symbol>,
  Input extends Record<string, string | symbol>,
> extends FSM<State, Input> {
  private readonly stateBitFlags: Record<State[keyof State], number>;
  // bit mask for ASCII lexical rules
  private readonly unicodeCharacterBitMask:
    | Uint8Array
    | Uint16Array
    | Uint32Array;
  // map of lexical rules to token types
  private readonly unicodeCharacterMap: Array<Input[keyof Input]> = [];

  constructor(
    states: State,
    transitions: Array<FSMTransition<State[keyof State], Input[keyof Input]>>,
    initialState: State[keyof State],
  ) {
    super(transitions, initialState);

    this.stateBitFlags = this.createStateBitFlags(states);
    this.unicodeCharacterBitMask = this.createStateSymbolBitMask(
      this.stateBitFlags,
      transitions,
    );
  }

  private createStateBitFlags(
    states: State,
  ): Record<State[keyof State], number> {
    const stateLabels = Object.values(states) as Array<State[keyof State]>;
    const stateBitFlags = {} as Record<State[keyof State], number>;

    if (stateLabels.length > 32) {
      throw new Error(
        "More than 32 states, but JavaScript only supports bitwise operations up to 32 bits",
      );
    }

    stateLabels.forEach((state, index) => {
      stateBitFlags[state] = 1 << index;
    });

    return stateBitFlags;
  }

  private createStateSymbolBitMask(
    stateBitFlags: Record<State[keyof State], number>,
    transitions: Array<FSMTransition<State[keyof State], Input[keyof Input]>>,
  ): Uint8Array | Uint16Array | Uint32Array {
    let symbolBitmask: Uint8Array | Uint16Array | Uint32Array;
    const numberOfStates = Object.keys(stateBitFlags).length;
    if (numberOfStates <= 8) {
      symbolBitmask = new Uint8Array(128);
    } else if (numberOfStates <= 16) {
      symbolBitmask = new Uint16Array(128);
    } else if (numberOfStates <= 32) {
      symbolBitmask = new Uint32Array(128);
    } else {
      throw new Error(
        "More than 32 states, but JavaScript only supports bitwise operations up to 32 bits",
      );
    }

    for (const transition of transitions) {
      const lexicalRule = transition.inputSymbol;
      let characters: string;
      if (typeof lexicalRule === "symbol") {
        if (typeof lexicalRule.description === "undefined") {
          throw new Error(
            "Symbol.description cannot be undefined when Symbol is used for StateTokenType.inputSymbol",
          );
        }
        characters = lexicalRule.description;
      } else {
        characters = lexicalRule.toString();
      }
      for (const character of characters) {
        const unicode = character.charCodeAt(0);
        if (unicode > 127) {
          throw new Error("Non-ASCII character");
        }
        symbolBitmask[unicode] |= stateBitFlags[transition.currentState];
        this.unicodeCharacterMap[unicode] = transition.inputSymbol;
      }
    }

    return symbolBitmask;
  }

  private findFirstSymbolForState(
    chunk: string,
  ): [number, Input[keyof Input] | null] {
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i);
      if (
        // bitwise AND
        this.unicodeCharacterBitMask[code] & this.stateBitFlags[this.state]
      ) {
        return [i, this.unicodeCharacterMap[code]];
      }
    }
    return [-1, null];
  }

  protected *yieldToken(chunk: string): Generator<LexerToken<State, Input>> {
    while (chunk.length > 0) {
      const [index, symbol] = this.findFirstSymbolForState(chunk);
      // if there is no lexeme in the chunk, emit the chunk
      if (index < 0) {
        yield { type: this.state, lexeme: chunk };
        return;
      }
      // else there is a lexeme in the chunk
      invariant(
        symbol,
        "findFirstTokenType found token, but type property of token is null",
      );
      // if the lexeme is not the first character in the chunk, emit everything up to (not including) the lexeme
      if (index > 0) {
        yield { type: this.state, lexeme: chunk.slice(0, index) };
      }

      this.transition(symbol);
      yield { type: this.state, lexeme: chunk.slice(index, index + 1), symbol };

      // if the lexeme is not the last character in the chunk, continue processing the rest of the chunk
      // biome-ignore lint/style/noParameterAssign:
      chunk = chunk.slice(index + 1);
    }
  }

  /**
   * Interprets a chunk, yields LexerTokens
   *
   * Iterate over `this.yieldToken(chunk)` to extract tokens from a chunk.
   * @param {string} chunk A chunk to interpret.
   */
  abstract tokenise(chunk: string): AsyncGenerator<LexerToken<State, Input>>;
}

export class JSONLexer extends Lexer<
  typeof JSONTokenType,
  typeof JSONTokenType
> {
  private isEscaped = false;
  private buffer = "";

  public async *tokenise(chunk: string) {
    const tokens = this.yieldToken(chunk);
    for (const token of tokens) {
      switch (token.type) {
        case JSONTokenType.Escape:
          // biome-ignore  lint/suspicious/noFallthroughSwitchClause: DRY
          // this.buffer += token.lexeme;
          this.isEscaped = true;
        case JSONTokenType.Number:
        case JSONTokenType.True:
        case JSONTokenType.False:
        case JSONTokenType.Null:
          this.buffer += token.lexeme;
          continue;
      }

      if (this.buffer.length > 0) {
        token.lexeme = this.buffer + token.lexeme;
        this.buffer = "";
      }
      if (this.isEscaped) {
        this.isEscaped = false;
      }

      yield token;
    }
  }
}
