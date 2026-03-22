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
  if (init?.signal?.aborted) {
    return;
  }

  const lexer = new JSONLexer(JSONTransitions, JSONValue.None);
  const parser = new JSONParser(lexer, JSONTransitions, JSONValue.None, [
    JSONValue.None,
  ]);
  const processor = StreamProcessorFactory.create(stream);

  const onAbort = () => {
    processor.stop();
  };

  init?.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for await (const chunk of processor) {
      yield* parser.parse(chunk);
    }
  } finally {
    init?.signal?.removeEventListener("abort", onAbort);
  }
}

export type { JSONChunk };
