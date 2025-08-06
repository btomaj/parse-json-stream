import { JSONLexer, JSONValue } from "~/lib/domain/lexer";
import { JSONParser } from "~/lib/domain/parser";
import { StreamProcessorFactory } from "~/lib/infrastructure/stream-adapter";
import type { JSONChunk } from "./lib/domain/chunk";
import { JSONTransitions } from "./lib/domain/transitions";

export async function* parseStream(
  stream:
    | ReadableStream
    | EventSource
    | WebSocket
    | AsyncIterable<string | Uint8Array | ArrayBuffer>,
): AsyncGenerator<JSONChunk> {
  const lexer = new JSONLexer(JSONTransitions, JSONValue.None);
  const parser = new JSONParser(lexer, JSONTransitions, JSONValue.None, [
    JSONValue.None,
  ]);

  for await (const chunk of StreamProcessorFactory.create(stream)) {
    yield* parser.parse(chunk);
  }
}
