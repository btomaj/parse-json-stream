import type { JSONChunk } from "~/lib/domain/chunk";
import { JSONLexer, JSONValue } from "~/lib/domain/lexer";
import { JSONParser } from "~/lib/domain/parser";
import { JSONTransitions } from "~/lib/domain/transitions";
import { StreamProcessorFactory } from "~/lib/infrastructure/stream-adapter";

export async function* parseStream(
  stream:
    | ReadableStream
    | EventSource
    | WebSocket
    | AsyncIterable<string | Uint8Array | ArrayBuffer>,
  init?: {
    signal?: AbortSignal;
  },
): AsyncGenerator<JSONChunk> {
  const lexer = new JSONLexer(JSONTransitions, JSONValue.None);
  const parser = new JSONParser(lexer, JSONTransitions, JSONValue.None, [
    JSONValue.None,
  ]);

  const processor = StreamProcessorFactory.create(stream);
  for await (const chunk of processor) {
    if (init?.signal?.aborted) {
      processor.stop();
      return;
    }
    yield* parser.parse(chunk);
  }
}

export type { JSONChunk };
