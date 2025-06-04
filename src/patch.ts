import { parseStream } from "./index";

declare global {
  interface JSON {
    parseStream(
      stream:
        | ReadableStream
        | EventSource
        | WebSocket
        | AsyncIterable<string | Uint8Array | ArrayBuffer>,
    ): void;
  }
}

JSON.parseStream = parseStream;
