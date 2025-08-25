export enum JSONValue {
  None = "none",
  Object = "object",
  Array = "array",
  String = "string",
  Number = "number",
  Boolean = "boolean",
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

/**
 * Represents a token produced by the lexer during parsing.
 *
 * A token contains information about a lexical unit found in the input,
 * including its type, position within the buffer, and the buffer content itself.
 *
 * @template Type The type of value (string, number, etc.)
 * @template Input The input symbol ({, [, \, etc.)
 */
export interface LexerToken<Type, Input> {
  /** The token type (state) that this token represents */
  type: Type[keyof Type];
  /** 0-based starting position of the token in the buffer (inclusive) */
  start: number;
  /** 0-based ending position of the token in the buffer (exclusive) */
  end: number;
  /** The string buffer containing the token data */
  buffer: string;
  /** Input symbol represented by this token [Optional] */
  symbol?: Input[keyof Input];
}

/**
 * Represents a transition in a Finite State Machine.
 *
 * A transition defines how the machine moves from one state to another
 * when a specific input symbol is encountered.
 *
 * @template State The before and after states
 * @template Input The input symbol
 */
export class FSMTransition<State, Input> {
  /**
   * Creates a new FSM transition.
   *
   * @param currentState The state the machine must be in for this transition to apply
   * @param inputSymbol The input symbol that triggers this transition
   * @param nextState The state that the state machine will move to after the transition
   */
  constructor(
    public readonly currentState: State,
    public readonly inputSymbol: Input,
    public readonly nextState: State,
  ) {}
}

/**
 * Abstract base class for Finite State Machines.
 *
 * Provides the core functionality for state management and transitions.
 * Concrete implementations define specific transition tables and behavior.
 *
 * @template State Possible states
 * @template Input Possible input symbols
 */
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

  /**
   * Creates a new Finite State Machine.
   *
   * @param transitions Array of all possible transitions for this FSM
   * @param initialState The initial state of the machine
   */
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

  /**
   * Gets the current state of the finite state machine.
   *
   * @returns The current state value
   */
  get state(): State[keyof State] {
    return this._state;
  }

  /**
   * Performs a state transition based on an input symbol.
   *
   * @param inputSymbol The input symbol that triggers the transition
   * @returns The transition that was executed
   * @throws Error if no valid transition exists for the current state and input symbol
   */
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

  /**
   * Resets the machine to a specific state.
   *
   * @param state The state to reset to
   */
  reset(state: State[keyof State]) {
    this._state = state;
  }
}

/**
 * Abstract base class for lexical analyzers (tokenisers).
 *
 * Provides efficient character-by-character tokenisation using precomputed
 * bitmasks for fast symbol lookup. Concrete implementations define how to
 * tokenise specific input into meaningful tokens.
 *
 * @extends FSM
 * @template State Possible lexer states
 * @template Input Possible input symbols
 */
export abstract class Lexer<
  State extends Record<string, string | number | symbol>,
  Input extends Record<string, string | symbol>,
> extends FSM<State, Input> {
  private readonly stateBitmasks: Record<State[keyof State], number>;
  /**
   * Bitmask for ASCII lexical rules.
   */
  private readonly unicodeCharacterFlags:
    | Uint8Array
    | Uint16Array
    | Uint32Array;
  /**
   * Maps lexical rules to token types.
   */
  private readonly unicodeCharacterMap: Array<Input[keyof Input]> = [];

  /**
   * Creates a lexical analyzer.
   *
   * @param transitions Array of FSM transitions defining the lexer behavior
   * @param initialState The initial state of the lexer
   */
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
    this.unicodeCharacterMap = this.createUnicodeCharacterMap(transitions);
  }

  /**
   * Creates bitmasks for each state to enable fast transition lookups.
   *
   * Each state gets a unique bit position, allowing for efficient bitwise
   * operations when determining valid transitions.
   *
   * @param transitions The FSM transitions to analyze
   * @returns Record mapping each state to its bitmask value
   * @throws Error if more than 32 states are defined (JavaScript bitwise limitation)
   * @private
   */
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

  /**
   * Creates a lookup table mapping ASCII characters to state bitmasks.
   *
   * For each ASCII character (0-127), stores a bitmask indicating which states
   * have transitions triggered by that character. This enables O(1) lookup
   * of valid transitions during tokenization.
   *
   * @param transitions The FSM transitions to analyze
   * @param bitmasks State bitmasks created by createStateBitmasks
   * @returns Typed array indexed by ASCII code, containing state bitmasks
   * @throws Error if non-ASCII characters are encountered
   * @private
   */
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
      Lexer.processLexicalRuleCharacters(lexicalRule, (character) => {
        const unicode = character.charCodeAt(0);
        if (unicode > 127) {
          throw new Error("Non-ASCII character");
        }
        bitmaskArray[unicode] |=
          bitmasks[transition.currentState] ?? 0xffffffff;
      });
    }

    return bitmaskArray;
  }

  /**
   * Creates a lookup table mapping ASCII characters to their corresponding input symbols.
   *
   * @param transitions The FSM transitions to analyze
   * @returns Array indexed by ASCII code, containing the corresponding input symbol
   * @throws Error if non-ASCII characters are encountered
   * @private
   */
  private createUnicodeCharacterMap(
    transitions: Array<FSMTransition<State[keyof State], Input[keyof Input]>>,
  ): Array<Input[keyof Input]> {
    const characterMap: Array<Input[keyof Input]> = [];

    for (const transition of transitions) {
      if (!transition.inputSymbol) {
        throw new Error(
          `inputSymbol cannot be falsy for transition: ${transition}`,
        );
      }
      const lexicalRule = transition.inputSymbol;
      Lexer.processLexicalRuleCharacters(lexicalRule, (character) => {
        const unicode = character.charCodeAt(0);
        if (unicode > 127) {
          throw new Error("Non-ASCII character");
        }
        characterMap[unicode] = transition.inputSymbol;
      });
    }

    return characterMap;
  }

  /**
   * Utility method simplifying the conversion of strings and Symbols
   * representing lexical rules into input symbols used by the lexer. It applies
   * a provided processor function to each character in the string or Symbol
   * description.
   *
   * @template Input The input symbol type
   * @param lexicalRule The string or Symbol representing a lexical rule to process
   * @param processor Function called to convert each character into a lexical rule
   * @throws Error if Symbol lacks description
   * @protected
   */
  protected static processLexicalRuleCharacters<
    Input extends Record<string, string | number | symbol>,
  >(lexicalRule: Input[keyof Input], processor: (character: string) => void) {
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
   *
   * Uses precomputed bitmasks for O(1) lookup per character, making this operation
   * highly efficient even for large chunks.
   *
   * @param chunk The string chunk to search
   * @param startIndex The starting index for the search (default: 0)
   * @returns Tuple of [index, symbol] where index is the position of the symbol,
   *          and symbol is the input symbol itself.
   *          Returns [-1, null] if no valid transition is found.
   * @protected
   */
  protected findFirstTransitionSymbol(
    chunk: string,
    startIndex = 0,
  ): [number, Input[keyof Input] | null] {
    for (let i = startIndex; i < chunk.length; i += 1) {
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
   * Tokenises a chunk of input text into lexical tokens.
   *
   * This abstract method must be implemented by concrete lexers to define
   * how input chunks are broken down into meaningful tokens. Uses
   * {@link findFirstTransitionSymbol} to locate token boundaries efficiently.
   *
   * @param chunk A chunk of input text to tokenize
   * @returns Generator yielding {@link LexerToken} objects for each identified token
   * @abstract
   */
  abstract tokenise(chunk: string): Generator<LexerToken<State, Input>>;
}

/**
 * Concrete lexical analyser for JSON text.
 *
 * Tokenises JSON input into meaningful lexical units, handling all JSON
 * syntax including strings with escape sequences, numbers, literals, and
 * structural elements. Optimized for streaming input with efficient
 * escape sequence processing across chunk boundaries.
 *
 * @example
 * ```typescript
 * const lexer = new JSONLexer(transitions, JSONValue.None);
 * const tokens = [...lexer.tokenise('{"name": "John"}')];
 * // Produces tokens for: {, "name", :, "John", }
 * ```
 */
export class JSONLexer extends Lexer<typeof JSONValue, typeof JSONSymbol> {
  private static readonly symbolLexemes = new Uint8Array(128);

  static {
    for (const lexicalRule of [
      JSONSymbol.LBrace,
      JSONSymbol.RBrace,
      JSONSymbol.LBracket,
      JSONSymbol.RBracket,
      JSONSymbol.Colon,
      JSONSymbol.Comma,
    ]) {
      Lexer.processLexicalRuleCharacters(lexicalRule, (character) => {
        const unicode = character.charCodeAt(0);
        if (unicode > 127) {
          throw new Error("Non-ASCII character");
        }
        JSONLexer.symbolLexemes[unicode] = 1;
      });
    }
  }

  /**
   * Buffers escape characters across chunk boundaries.
   *
   * Escape sequences (especially Unicode \uXXXX) can span multiple
   * input chunks, so this buffer accumulates characters until a complete
   * escape sequence is available for processing.
   *
   * Maximum size is 6 bytes to handle Unicode escapes: \uXXXX
   *
   * Used by {@link processEscapeCharacter}.
   * @private
   */
  private readonly escapeBuffer = new Uint8Array(6);

  /**
   * Tracks the current length of data in the escape buffer.
   *
   * Reset to 0 when a complete escape sequence is processed or
   * when an invalid sequence is encountered.
   *
   * Used by {@link processEscapeCharacter}.
   * @private
   */
  private escapeBufferLength = 0;

  private static readonly escapeSequenceTable: Array<string> = new Array(128);

  static {
    JSONLexer.escapeSequenceTable[34] = '"'; // "
    JSONLexer.escapeSequenceTable[92] = "\\"; // \
    JSONLexer.escapeSequenceTable[47] = "/"; // /
    JSONLexer.escapeSequenceTable[98] = "\b"; // backspace
    JSONLexer.escapeSequenceTable[102] = "\f"; // form feed
    JSONLexer.escapeSequenceTable[110] = "\n"; // newline
    JSONLexer.escapeSequenceTable[114] = "\r"; // carriage return
    JSONLexer.escapeSequenceTable[116] = "\t"; // tab
  }

  /**
   * Processes escape sequences in JSON strings, handling multi-chunk sequences.
   *
   * Supports all JSON escape sequences including:
   * - Simple escapes: \", \\, \/, \b, \f, \n, \r, \t
   * - Unicode escapes: \uXXXX (4 hex digits)
   *
   * Can handle escape sequences that span multiple input chunks by buffering
   * partial sequences until complete.
   *
   * @param chunk The input chunk containing the whole, or part, of the escape sequence
   * @param position The 0-based character index of the escape character encountered in the chunk
   * @returns Tuple of [position, escapeSequence] where:
   *          - position: next position to continue processing
   *          - escapeSequence: decoded character if complete, null if incomplete/invalid
   * @private
   */
  private processEscapeCharacter(
    chunk: string,
    position: number,
  ): [number, string | null] {
    const buffer = this.escapeBuffer;
    const bufferLength = this.escapeBufferLength;
    const chunkLength = chunk.length;
    const U = 117; // "u".charCodeAt(0);

    let needed = 2 - bufferLength;
    if (
      (bufferLength >= 2 && buffer[1] === U) ||
      (bufferLength < 2 && chunk.charCodeAt(position + 1 - bufferLength) === U)
    ) {
      needed = 6 - bufferLength; // Unicode escape
    }

    const available = Math.min(needed, chunkLength - position);
    for (let i = 0; i < available; i += 1) {
      buffer[bufferLength + i] = chunk.charCodeAt(position + i);
    }
    position += available;

    if (available < needed) {
      this.escapeBufferLength += available;
      return [position, null];
    }

    let result: string | null = null;

    if (buffer[1] !== U) {
      // result === null on invalid escape code; continues lexing
      result = JSONLexer.escapeSequenceTable[buffer[1]] ?? null;
    } else {
      // unicode escape sequence \uXXXX
      let codePoint = 0;
      for (let i = 2; i < 6; i += 1) {
        const unicodeCharacterCode = buffer[i];
        let hexDigit: number;
        if (unicodeCharacterCode >= 48 && unicodeCharacterCode <= 57) {
          hexDigit = unicodeCharacterCode - 48; // 0-9
        } else if (unicodeCharacterCode >= 65 && unicodeCharacterCode <= 70) {
          hexDigit = unicodeCharacterCode - 65 + 10; // A-F
        } else if (unicodeCharacterCode >= 97 && unicodeCharacterCode <= 102) {
          hexDigit = unicodeCharacterCode - 97 + 10; // a-f
        } else {
          // result === null on invalid escape sequence; continues lexing
          codePoint = -1;
          break;
        }
        codePoint = (codePoint << 4) | hexDigit;
      }
      if (codePoint >= 0 && codePoint <= 0x10ffff) {
        result = String.fromCodePoint(codePoint);
      }
    }

    this.escapeBufferLength = 0;
    return [position, result];
  }

  /**
   * Tokenizes a chunk of JSON input into lexical tokens.
   *
   * Processes the input character by character, identifying JSON structural
   * elements (braces, brackets, etc.), and value boundaries. Handles escape
   * sequences in strings and maintains state across chunk boundaries for
   * streaming input.
   *
   * Key behaviors:
   * - Skips whitespace when not inside a value
   * - Processes escape sequences (including multi-chunk sequences)
   * - Emits tokens for structural elements immediately
   * - Emits tokens for the whole, or part, of values available in chunk until value boundaries are reached
   *
   * @param chunk A chunk of JSON text to tokenise
   * @yields LexerToken objects representing lexical units
   */
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
    let escapeSequence: string | null;

    if (this.escapeBufferLength > 0) {
      [position, escapeSequence] = this.processEscapeCharacter(chunk, position);

      if (escapeSequence) {
        yield {
          type: JSONValue.String,
          start: 0,
          end: escapeSequence.length,
          buffer: escapeSequence,
        };
        mark = position;
      } else {
        return;
      }
    }

    while (mark < chunkLength) {
      [position, symbol] = this.findFirstTransitionSymbol(chunk, position);
      // if there is no symbol remaining, emit the remaining non-whitespace content
      if (symbol === null) {
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

      if (symbol === JSONSymbol.Escape) {
        [position, escapeSequence] = this.processEscapeCharacter(
          chunk,
          position,
        );

        if (escapeSequence) {
          yield {
            type: JSONValue.String,
            start: 0,
            end: escapeSequence.length,
            buffer: escapeSequence,
          };
          mark = position;
          continue;
        }
        return;
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
  }
}
