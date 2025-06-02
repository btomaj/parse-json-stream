declare global {
  interface JSON {
    parseStream(
      stream: ReadableStream | EventSource | WebSocket | AsyncIterable,
    ): void;
  }
}

JSON.parseStream = (
  stream: ReadableStream | EventSource | WebSocket | AsyncIterable,
): void => {
  throw new Error("parseStream not yet implemented");
};

export {};
