import { StreamProcessorFactory } from "./stream-adapter";

export function parseStream(
  stream:
    | ReadableStream
    | EventSource
    | WebSocket
    | AsyncIterable<string | Uint8Array | ArrayBuffer>,
): void {
  const processor = StreamProcessorFactory.create(stream);
  throw new Error("parseStream not yet implemented");
}
