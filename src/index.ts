import { JSONLexer, JSONSymbol, JSONValue } from "~/lib/domain/lexer";
import { JSONParser } from "~/lib/domain/parser";
import { StreamProcessorFactory } from "~/lib/infrastructure/stream-adapter";
import { JSONTransitions } from "./lib/domain/transitions";

/**
 * TODO
 * - [ ] Emit error event for unexpected JSONTokenType, e.g. JSONTokenType.Comma when waiting for a value inside an JSONState.Object
 * - [ ] Replace template literal with nested map for transition lookup
 */

export function parseStream(
  stream:
    | ReadableStream
    | EventSource
    | WebSocket
    | AsyncIterable<string | Uint8Array | ArrayBuffer>,
): void {
  const lexer = new JSONLexer(
    JSONSymbol,
    JSONTransitions,
    JSONSymbol.Whitespace,
  );
  const parser = new JSONParser(lexer, JSONTransitions, JSONSymbol.Whitespace, [
    JSONValue.None,
  ]);

  const processor = StreamProcessorFactory.create(stream);
  throw new Error("parseStream not yet implemented");
}
