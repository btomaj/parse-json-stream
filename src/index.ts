export function parseStream(
  stream:
    | ReadableStream
    | EventSource
    | WebSocket
    | AsyncIterable<string | Uint8Array | ArrayBuffer>,
): void {
  throw new Error("parseStream not yet implemented");
}
