import invariant from "tiny-invariant";
import type { FSM } from "./state";

export class StateTokenType<S, I> {
  constructor(
    public readonly currentState: S,
    public readonly inputSymbol: I,
  ) {}
}

export interface LexerToken<S, C> {
  type: S[keyof S] | C[keyof C];
  lexeme: string;
}

/**
 * TODO
 * - [ ] Determine what should be async in the lexeme
 */
export abstract class Lexer<
  S extends Record<string, string | number>,
  C extends Record<string, string | symbol>,
> {
  private readonly stateBitFlags: Record<S[keyof S], number>;
  // bit mask for ASCII lexical rules
  private readonly unicodeCharacterBitMask:
    | Uint8Array
    | Uint16Array
    | Uint32Array;
  // map of lexical rules to token types
  private readonly unicodeCharacterMap: Array<C[keyof C]> = [];
  private readonly fsm: FSM<S, C>;

  constructor(
    states: S,
    stateTokenTypeMap: Array<StateTokenType<S[keyof S], C[keyof C]>>,
    fsm: FSM<S, C>,
  ) {
    this.fsm = fsm;

    this.stateBitFlags = this.createStateBitFlags(states);
    this.unicodeCharacterBitMask = this.createStateTokenTypeBitMask(
      this.stateBitFlags,
      stateTokenTypeMap,
    );
  }

  private createStateBitFlags(states: S): Record<S[keyof S], number> {
    const stateLabels = Object.values(states) as Array<S[keyof S]>;
    const stateBitFlags = {} as Record<S[keyof S], number>;

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

  private createStateTokenTypeBitMask(
    stateBitFlags: Record<S[keyof S], number>,
    stateTokenTypeMaps: Array<StateTokenType<S[keyof S], C[keyof C]>>,
  ): Uint8Array | Uint16Array | Uint32Array {
    let tokenTypeBitmask: Uint8Array | Uint16Array | Uint32Array;
    const numberOfStates = Object.keys(stateBitFlags).length;
    if (numberOfStates <= 8) {
      tokenTypeBitmask = new Uint8Array(128);
    } else if (numberOfStates <= 16) {
      tokenTypeBitmask = new Uint16Array(128);
    } else if (numberOfStates <= 32) {
      tokenTypeBitmask = new Uint32Array(128);
    } else {
      throw new Error(
        "More than 32 states, but JavaScript only supports bitwise operations up to 32 bits",
      );
    }

    for (const stateTokenTypeMap of stateTokenTypeMaps) {
      const lexicalRule = stateTokenTypeMap.inputSymbol;
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
        tokenTypeBitmask[unicode] |=
          stateBitFlags[stateTokenTypeMap.currentState];
        this.unicodeCharacterMap[unicode] = stateTokenTypeMap.inputSymbol;
      }
    }

    return tokenTypeBitmask;
  }

  private findFirstTokenTypeForState(
    chunk: string,
  ): [number, C[keyof C] | null] {
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i);
      if (
        // bitwise AND
        this.unicodeCharacterBitMask[code] & this.stateBitFlags[this.fsm.state]
      ) {
        return [i, this.unicodeCharacterMap[code]];
      }
    }
    return [-1, null];
  }

  protected *yieldToken(chunk: string): Generator<LexerToken<S, C>> {
    while (chunk.length > 0) {
      const [index, tokenType] = this.findFirstTokenTypeForState(chunk);
      // if there is no lexeme in the chunk, emit the chunk
      if (index < 0) {
        yield { type: this.fsm.state, lexeme: chunk };
        return;
      }
      // else there is a lexeme in the chunk
      invariant(
        tokenType,
        "findFirstTokenType found token, but type property of token is null",
      );
      // if the lexeme is not the first character in the chunk, emit everything up to (not including) the lexeme
      if (index > 0) {
        yield { type: this.fsm.state, lexeme: chunk.slice(0, index) };
      }

      this.fsm.transition(tokenType);
      yield { type: tokenType, lexeme: chunk.slice(index, index + 1) };

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
  abstract tokenise(chunk: string): AsyncGenerator<LexerToken<S, C>>;
}
