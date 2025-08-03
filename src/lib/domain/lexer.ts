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
 * | Token type    | Delimiter             | Description                    |
 * | ------------- | --------------------- | ------------------------------ |
 * | `LBRACE`      | `{`                   | Start of an object             |
 * | `RBRACE`      | `}`                   | End of an object               |
 * | `LBRACKET`    | `[`                   | Start of an array              |
 * | `RBRACKET`    | `]`                   | End of an array                |
 * | `COLON`       | `:`                   | Key-value separator            |
 * | `COMMA`       | `,`                   | Member/element separator       |
 * | `STRING`      | `"`                   | Start/end of a string          |
 * | `NUMBER`      | `-`, `1`, `2`, etc.   | Start of an integer or float   |
 * | `TRUE`        | `t`                   | Start of a true literal        |
 * | `FALSE`       | `f`                   | Start of a false literal       |
 * | `NULL`        | `n`                   | Start of a null literal        |
 * | `ESCAPE`      | `\`                   | Escape character               |
 * | `WHITESPACE`  | ` `, `\t`, `\n`, `\r` | Whitespace                     |
 *
 * @enum {symbol}
 */
export const JSONSymbol = {
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
export type JSONSymbol = (typeof JSONSymbol)[keyof typeof JSONSymbol];

export interface LexerToken<State, Input> {
  type: State[keyof State];
  start: number;
  end: number;
  buffer: string;
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

export abstract class Lexer<
  State extends Record<string, string | number | symbol>,
  Input extends Record<string, string | symbol>,
> extends FSM<State, Input> {
  private readonly stateBitmasks: Record<State[keyof State], number>;
  // bit mask for ASCII lexical rules
  private readonly unicodeCharacterFlags:
    | Uint8Array
    | Uint16Array
    | Uint32Array;
  // map of lexical rules to token types
  private readonly unicodeCharacterMap: Array<Input[keyof Input]> = [];

  constructor(
    transitions: Array<FSMTransition<State[keyof State], Input[keyof Input]>>,
    initialState: State[keyof State],
  ) {
    super(transitions, initialState);

    this.stateBitmasks = this.createStateBitmasks(transitions);
    this.unicodeCharacterFlags = this.createLexicalRuleFlags(
      transitions,
      this.stateBitmasks,
    );
  }

  private createStateBitmasks(
    transitions: Array<FSMTransition<State[keyof State], Input[keyof Input]>>,
  ): Record<State[keyof State], number> {
    const stateLabels = new Set<State[keyof State]>();

    // Extract all unique states from transitions
    for (const transition of transitions) {
      stateLabels.add(transition.currentState);
      stateLabels.add(transition.nextState);
    }

    const stateLabelsArray = Array.from(stateLabels);
    const stateBitmasks = {} as Record<State[keyof State], number>;

    if (stateLabelsArray.length > 32) {
      throw new Error(
        "More than 32 states, but JavaScript only supports bitwise operations up to 32 bits",
      );
    }

    stateLabelsArray.forEach((state, index) => {
      stateBitmasks[state] = 1 << index;
    });

    return stateBitmasks;
  }

  private createLexicalRuleFlags(
    transitions: Array<FSMTransition<State[keyof State], Input[keyof Input]>>,
    bitmasks: Record<State[keyof State], number>,
  ): Uint8Array | Uint16Array | Uint32Array {
    let bitmaskArray: Uint8Array | Uint16Array | Uint32Array;
    const numberOfBitmasks =
      typeof bitmasks === "object" ? Object.keys(bitmasks).length : 0;
    if (numberOfBitmasks <= 8) {
      bitmaskArray = new Uint8Array(128);
    } else if (numberOfBitmasks <= 16) {
      bitmaskArray = new Uint16Array(128);
    } else if (numberOfBitmasks <= 32) {
      bitmaskArray = new Uint32Array(128);
    } else {
      throw new Error(
        "More than 32 states, but JavaScript only supports bitwise operations up to 32 bits",
      );
    }

    for (const transition of transitions) {
      if (!transition.inputSymbol) {
        throw new Error(
          `inputSymbol cannot be falsy for transition: ${transition}`,
        );
      }
      const lexicalRule = transition.inputSymbol;
      this.processLexicalRuleCharacters(lexicalRule, (character) => {
        const unicode = character.charCodeAt(0);
        if (unicode > 127) {
          throw new Error("Non-ASCII character");
        }
        bitmaskArray[unicode] |=
          bitmasks[transition.currentState] ?? 0xffffffff;
        this.unicodeCharacterMap[unicode] = transition.inputSymbol;
      });
    }

    return bitmaskArray;
  }

  protected processLexicalRuleCharacters(
    lexicalRule: Input[keyof Input],
    processor: (character: string) => void,
  ) {
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
      processor(character);
    }
  }

  /**
   * Finds the first symbol with a transition for the current state.
   * @param chunk The chunk to search.
   * @param startIndex The starting index for the search.
   * @returns A tuple containing the index of the first symbol and the symbol itself.
   */
  protected findFirstTransitionSymbol(
    chunk: string,
    startIndex = 0,
  ): [number, Input[keyof Input] | null] {
    for (let i = startIndex; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i);
      if (
        // bitwise AND
        this.unicodeCharacterFlags[code] & this.stateBitmasks[this.state]
      ) {
        return [i, this.unicodeCharacterMap[code]];
      }
    }
    return [-1, null];
  }

  /**
   * Interprets a chunk, and yields `LexerToken`s
   *
   * Use `findFirstTransitionSymbol` to find token boundary characters from the
   * transitions, and tokenise the chunk into lexemes.
   * @param {string} chunk A chunk to interpret.
   */
  abstract tokenise(chunk: string): Generator<LexerToken<State, Input>>;
}

export class JSONLexer extends Lexer<typeof JSONValue, typeof JSONSymbol> {
  private isEscaped = false;

  private static readonly symbolLexemes = new Uint8Array(128);

  constructor(
    transitions: Array<
      FSMTransition<
        (typeof JSONValue)[keyof typeof JSONValue],
        (typeof JSONSymbol)[keyof typeof JSONSymbol]
      >
    >,
    initialState: (typeof JSONValue)[keyof typeof JSONValue],
  ) {
    super(transitions, initialState);
    for (const lexicalRule of [
      JSONSymbol.LBrace,
      JSONSymbol.RBrace,
      JSONSymbol.LBracket,
      JSONSymbol.RBracket,
      JSONSymbol.Colon,
      JSONSymbol.Comma,
    ]) {
      this.processLexicalRuleCharacters(lexicalRule, (character) => {
        const unicode = character.charCodeAt(0);
        if (unicode > 127) {
          throw new Error("Non-ASCII character");
        }
        JSONLexer.symbolLexemes[unicode] = 1;
      });
    }
  }

  public *tokenise(
    chunk: string,
  ): Generator<LexerToken<typeof JSONValue, typeof JSONSymbol>> {
    const chunkLength = chunk.length;
    /**
     * 0-based offset for lexeme starting position
     */
    let mark = 0;
    /**
     * 0-based character index for current position
     */
    let position = 0;
    let symbol: JSONSymbol | null;

    // if the last character in the previous chunk was an escape character, escape the first character
    if (this.isEscaped) {
      this.isEscaped = false;
      position += 1;
    }

    while (position < chunkLength) {
      [position, symbol] = this.findFirstTransitionSymbol(chunk, position);
      // if there is no symbol remaining, emit the remaining non-whitespace content
      if (position < 0) {
        // don't yield whitespace
        if (this.state === JSONValue.None) {
          return;
        }

        yield {
          type: this.state,
          start: mark,
          end: chunkLength,
          buffer: chunk,
        };
        return;
      }
      // else there is a symbol in the chunk
      invariant(symbol);

      // skip past the escaped character
      if (symbol === JSONSymbol.Escape) {
        // if the character is last in the chunk, escape the first character in the next chunk
        if (position + 1 === chunkLength) {
          this.isEscaped = true;
          break;
        }
        position += 2;
        continue;
      }

      // if the symbol is not the first character, emit everything up to (not including) the symbol
      // biome-ignore lint/suspicious/noConfusingLabels: early return
      yieldLexeme: if (position > mark) {
        // don't yield whitespace
        if (this.state === JSONValue.None) {
          mark = position;
          break yieldLexeme;
        }

        yield {
          type: this.state,
          start: mark,
          end: position,
          buffer: chunk,
        };

        mark = position; // start past lexeme
      }

      this.transition(symbol);

      position += 1; // advance position past symbol
      if (JSONLexer.symbolLexemes[chunk.charCodeAt(position - 1)]) {
        yield {
          type: this.state,
          start: mark,
          end: position,
          buffer: chunk,
          symbol,
        };
        mark = position; // continue after symbol
      } else if (
        // skip opening quotation mark of a string
        this.state === JSONValue.String &&
        symbol === JSONSymbol.String
      ) {
        mark = position; // continue after symbol
      }

      // if the symbol is not the last character in the chunk, loop, and continue processing the rest of the chunk
    }

    // XXX return any remaining buffered value
  }
}
