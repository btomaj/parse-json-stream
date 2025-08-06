export class ReadableStreamProcessor implements AsyncIterable<string> {
  private reader: ReadableStreamDefaultReader<
    string | Uint8Array | ArrayBuffer
  >;
  private decoder = new TextDecoder();
  private abortController = new AbortController();

  constructor(
    private stream: ReadableStream<string | Uint8Array | ArrayBuffer>,
  ) {
    this.reader = this.stream.getReader();
  }

  stop(): void {
    this.abortController.abort();
    this.reader.cancel();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    try {
      while (!this.abortController.signal.aborted) {
        const { done, value } = await this.reader.read();

        if (done) {
          break;
        }

        yield this.decodeChunk(value);
      }
    } finally {
      this.reader.releaseLock();
    }
  }

  private decodeChunk(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    // TypedArray, or ArrayBuffer
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return this.decoder.decode(value, { stream: true });
    }

    throw new Error(`Unsupported chunk type for JSON stream: ${typeof value}`);
  }
}

export class EventSourceProcessor implements AsyncIterable<string> {
  private eventSource: EventSource;
  private abortController = new AbortController();
  private resolvePromise: (value: string | null) => void;
  private rejectPromise: (error: Error) => void;

  constructor(eventSource: EventSource) {
    this.eventSource = eventSource;

    this.eventSource.onmessage = (event) => {
      this.resolvePromise(event.data);
    };

    this.eventSource.onerror = () => {
      if (this.eventSource.readyState === EventSource.CLOSED) {
        this.resolvePromise(null); // signal end
      } else {
        this.rejectPromise(new Error("Server-side event error"));
      }
    };

    this.resolvePromise = () => {
      throw new Error(
        "Server-side event received before EventSourceProcessor iterator initialised resolvePromise method",
      );
    };
    this.rejectPromise = () => {
      throw new Error(
        "Server-side event received before EventSourceProcessor iterator initialised rejectPromise method",
      );
    };
  }

  stop(): void {
    this.abortController.abort();
    this.eventSource.close();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    try {
      while (
        this.eventSource.readyState !== EventSource.CLOSED &&
        !this.abortController.signal.aborted
      ) {
        const message = await new Promise<string | null>((resolve, reject) => {
          this.resolvePromise = resolve;
          this.rejectPromise = reject;
        });

        if (message === null || this.abortController.signal.aborted) {
          break;
        }
        yield message;
      }
    } finally {
      // garbage collection
      this.eventSource.onmessage = null;
      this.eventSource.onerror = null;
    }
  }
}

export class WebSocketProcessor implements AsyncIterable<string> {
  private decoder = new TextDecoder();
  private abortController = new AbortController();

  constructor(private webSocket: WebSocket) {}

  stop(): void {
    this.abortController.abort();
    this.webSocket.close();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    let resolveNext: ((value: string | null) => void) | null = null;
    let rejectNext: ((error: Error) => void) | null = null;
    let ended = false;

    this.webSocket.onmessage = (event) => {
      if (resolveNext) {
        const chunk = this.decodeChunk(event.data);
        resolveNext(chunk);
        resolveNext = null;
        rejectNext = null;
      }
    };

    this.webSocket.onclose = () => {
      ended = true;
      if (resolveNext) {
        resolveNext(null); // Signal end
        resolveNext = null;
        rejectNext = null;
      }
    };

    this.webSocket.onerror = () => {
      const error = new Error("WebSocket error");
      if (rejectNext) {
        rejectNext(error);
        resolveNext = null;
        rejectNext = null;
      }
    };

    try {
      while (!ended && !this.abortController.signal.aborted) {
        const message = await new Promise<string | null>((resolve, reject) => {
          if (this.abortController.signal.aborted) {
            resolve(null);
            return;
          }
          resolveNext = resolve;
          rejectNext = reject;
        });

        if (message === null || this.abortController.signal.aborted) {
          break;
        }
        yield message;
      }
    } finally {
      this.webSocket.onmessage = null;
      this.webSocket.onclose = null;
      this.webSocket.onerror = null;
    }
  }

  private decodeChunk(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    // TypedArray, or ArrayBuffer
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return this.decoder.decode(value, { stream: true });
    }

    throw new Error(`Unsupported chunk type for JSON stream: ${typeof value}`);
  }
}

export class AsyncIterableProcessor implements AsyncIterable<string> {
  private asyncIterable: AsyncIterable<string | Uint8Array | ArrayBuffer>;
  private abortController = new AbortController();
  private decoder = new TextDecoder();

  constructor(asyncIterable: AsyncIterable<string | Uint8Array | ArrayBuffer>) {
    this.asyncIterable = asyncIterable;
  }

  stop(): void {
    this.abortController.abort();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    for await (const chunk of this.asyncIterable) {
      if (this.abortController.signal.aborted) {
        return;
      }

      yield this.decodeChunk(chunk);
    }
  }

  private decodeChunk(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }

    // TypedArray, or ArrayBuffer
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      return this.decoder.decode(value, { stream: true });
    }

    throw new Error(`Unsupported chunk type for JSON stream: ${typeof value}`);
  }
}

// biome-ignore lint/complexity/noStaticOnlyClass: allow
export class StreamProcessorFactory {
  private static forReadableStream(
    stream: ReadableStream,
  ): AsyncIterable<string> {
    return new ReadableStreamProcessor(stream);
  }

  private static forEventSource(
    eventSource: EventSource,
  ): AsyncIterable<string> {
    return new EventSourceProcessor(eventSource);
  }

  private static forWebSocket(webSocket: WebSocket): AsyncIterable<string> {
    return new WebSocketProcessor(webSocket);
  }

  private static forAsyncIterable(
    asyncIterable: AsyncIterable<string | Uint8Array | ArrayBuffer>,
  ): AsyncIterable<string> {
    return new AsyncIterableProcessor(asyncIterable);
  }

  static create(
    stream:
      | ReadableStream
      | EventSource
      | WebSocket
      | AsyncIterable<string | Uint8Array | ArrayBuffer>,
  ): AsyncIterable<string> {
    if (typeof stream === "undefined" || stream === null) {
      throw new Error("Stream is undefined or null");
    }

    if (stream instanceof ReadableStream) {
      return StreamProcessorFactory.forReadableStream(stream);
    }

    if (typeof EventSource !== "undefined" && stream instanceof EventSource) {
      return StreamProcessorFactory.forEventSource(stream);
    }

    if (typeof WebSocket !== "undefined" && stream instanceof WebSocket) {
      return StreamProcessorFactory.forWebSocket(stream);
    }

    if (Symbol.asyncIterator in stream) {
      return StreamProcessorFactory.forAsyncIterable(stream);
    }

    throw new Error("Unsupported stream type");
  }
}
