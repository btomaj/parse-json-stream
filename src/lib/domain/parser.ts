/**
 * Parser passes chunk to Lexer. Lexer returns lexemes from chunk. Parser
 * parses the lexemes; maintaining Object and Array metadata, and returning
 * primitives with metadata. E.g. ["key", 0, "key"], and "string...".
 */
import type { Lexer } from "./lexer";

export class Parser<S, C extends { toString(): string }> {
  constructor(private lexer: Lexer<S, C>) {}
}
