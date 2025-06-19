/**
 * Parser passes chunk to Lexer. Lexer returns lexemes from chunk. Parser
 * parses the lexemes; maintaining Object and Array metadata, and returning
 * primitives with metadata. E.g. ["key", 0, "key"], and "string...".
 */
import type { Lexer } from "./lexer";

export class Parser<
  S extends Record<string, string | number>,
  C extends Record<string, string | number | symbol>,
> {
  constructor(private lexer: Lexer<S, C>) {}
}
