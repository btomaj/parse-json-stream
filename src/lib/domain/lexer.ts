import type { FSM } from "./state";

export class StateTokenType<S, I> {
  constructor(
    public readonly currentState: S,
    public readonly inputSymbol: I,
  ) {}
}

/**
 * TODO
 * - [ ] Determine what should be async in the lexeme
 */
export abstract class Lexer<
  S extends string | number,
  C extends { toString(): string },
> {
  private readonly unicodeCharacterMask = new Uint8Array(128); // mask for ASCII characters
  private readonly unicodeCharacterMap: Array<C> = []; // map of Unicode to classifications
  private readonly listeners: Array<
    (token: { type: S | C; lexeme: string }) => void
  > = [];
  protected readonly fsm: FSM<S, C>;

  constructor(
    states: Record<string, S>,
    stateTokenTypeMap: Array<StateTokenType<S, C>>,
    fsm: FSM<S, C>,
  ) {
    this.fsm = fsm;

    const stateBitFlags = this.createStateBitFlags(states);
    const bitMask = this.createStateTokenTypeBitMask(
      stateBitFlags,
      stateTokenTypeMap,
    );
  }

  private createStateBitFlags(states: Record<string, S>): Record<S, number> {
    const stateLabels = Object.values(states);
    const stateBitFlags: Record<S, number> = {} as Record<S, number>;

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
    stateBitFlags: Record<S, number>,
    stateTokenTypeMaps: Array<StateTokenType<S, C>>,
  ): Uint8Array | Uint16Array | Uint32Array {
    let tokenTypeBitmask: Uint8Array | Uint16Array | Uint32Array;
    const statesCount = Object.keys(stateBitFlags).length;
    if (statesCount <= 8) {
      tokenTypeBitmask = new Uint8Array(128);
    } else if (statesCount <= 16) {
      tokenTypeBitmask = new Uint16Array(128);
    } else if (statesCount <= 32) {
      tokenTypeBitmask = new Uint32Array(128);
    } else {
      throw new Error(
        "More than 32 states, but JavaScript only supports bitwise operations up to 32 bits",
      );
    }

    for (const stateTokenTypeMap of stateTokenTypeMaps) {
      const symbols = stateTokenTypeMap.inputSymbol.toString();
      for (const character of symbols) {
        const unicode = character.charCodeAt(0);
        if (unicode > 127) {
          throw new Error("Non-ASCII character");
        }
        tokenTypeBitmask[unicode] |=
          stateBitFlags[stateTokenTypeMap.currentState];
      }
    }

    return tokenTypeBitmask;
  }

  protected findFirstTokenType(chunk: string): [number, C | null] {
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i);
      if (this.unicodeCharacterMask[code]) {
        return [i, this.unicodeCharacterMap[code]];
      }
    }
    return [-1, null];
  }

  /**
   * Interprets a chunk, and emit lexemes if any.
   * @param {string} chunk A chunk to interpret.
   */
  abstract process(chunk: string): void;

  protected emit(token: {
    type: S | C;
    lexeme: string;
  }): void {
    for (const listener of this.listeners) {
      listener(token);
    }
  }

  protected addListener(
    listener: (token: {
      type: S | C;
      lexeme: string;
    }) => void,
  ): void {
    this.listeners.push(listener);
  }
}
