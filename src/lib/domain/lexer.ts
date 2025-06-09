import { isPath } from "msw/lib/core/utils/matching/matchRequestUrl";

/**
 * TODO
 * - [ ] Determine what should be async in the lexeme
 */
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

abstract class Lexer<T extends { [key: string]: string }> {
  private mask = new Uint8Array(128); // mask for ASCII characters
  private map: Array<T[keyof T]> = []; // map of Unicode to classifications
  private listeners: Array<(chunk: string) => void> = [];

  constructor(classifications: T) {
    for (const [category, characters] of Object.entries(classifications)) {
      const lexemes = [...characters];
      for (const lexeme of lexemes) {
        const unicode = lexeme.charCodeAt(0);
        if (unicode > 127) {
          throw new Error("Non-ASCII character");
        }
        this.mask[unicode] = 1;
        this.map[unicode] = classifications[category as keyof T];
      }
    }
  }

  private findIndexOfFirstMatch(string: string): number {
    for (let i = 0; i < string.length; i++) {
      const code = string.charCodeAt(i);
      if (this.mask[code]) {
        return i;
      }
    }
    return -1;
  }

  protected process(chunk: string): void {
    const index = this.findIndexOfFirstMatch(chunk);
    if (index < 0) {
      this.emit(chunk);
      return;
    }
    this.emit(chunk.slice(0, index)); // emit everything up to (not including) the lexeme
    this.emit(this.map[chunk.charCodeAt(index)]); // emit the classification of the lexeme
    if (index + 1 > chunk.length) {
      this.process(chunk.slice(index + 1)); // process everything after (not including) the lexeme
    }
  }

  protected emit(chunk: string): void {
    for (const listener of this.listeners) {
      listener(chunk);
    }
  }

  addListener(listener: (chunk: string) => void): void {
    this.listeners.push(listener);
  }
}

export class JSONLexer extends Lexer<typeof Trigger> {
  private isEscaped = false;

  constructor(
    classifications: typeof Trigger,
    private escapeCharacter: string = Trigger.Escape,
  ) {
    super(classifications);
  }

  protected emit(chunk: string): void {
    // this if statement is first so that we emit "\\\\"
    if (this.isEscaped) {
      super.emit(this.escapeCharacter + chunk);
      this.isEscaped = false;
      return;
    }
    if (chunk === this.escapeCharacter) {
      this.isEscaped = true;
      return;
    }
    super.emit(chunk);
  }
}
