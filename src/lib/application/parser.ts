/**
 * Parser passes chunk to Lexer. Lexer returns tokens. Parser parses the tokens;
 * maintaining Object and Array metadata, and returning primitives with
 * metadata. E.g. ["key", 0, "key"], and "string...".
 */
import type { Lexer } from "~/lib/domain/lexer";
import type { PDA } from "~/lib/domain/state";

export class JSONParserUseCase<
  S extends Record<string, string | number>,
  C extends Record<string, string | symbol>,
> {
  constructor(
    private lexer: Lexer<S, C>,
    private pda: PDA<S, C>,
  ) {}
}
