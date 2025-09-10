/**
 * Processes string, Uint8Array, or ArrayBuffer data from a ReadableStream into
 * a string AsyncIterable.
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/stream');
 * const processor = new ReadableStreamProcessor(response.body);
 *
 * for await (const chunk of processor) {
 *   console.log('Received chunk:', chunk);
 * }
 * ```
 */
export class ReadableStreamProcessor implements AsyncIterable<string> {
  private reader: ReadableStreamDefaultReader<
    string | Uint8Array | ArrayBuffer
  >;
  private decoder = new TextDecoder();
  private abortController = new AbortController();

  /**
   * Creates a new ReadableStreamProcessor.
   * @param stream The ReadableStream to process.
   */
  constructor(
    private stream: ReadableStream<string | Uint8Array | ArrayBuffer>,
  ) {
    this.reader = this.stream.getReader();
  }

  /**
   * Aborts the processing operation, and cancels the underlying reader.
   */
  stop(): void {
    this.abortController.abort();
    this.reader.cancel();
  }

  /**
   * Yields strings from chunks from the ReadableStream until the stream is
   * completed, or aborted, converting each chunk to a string. Reader lock is
   * automatically released when finished.
   *
   * @yields String chunks decoded from the stream
   */
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

  /**
   * Decodes ArrayBuffer/TypedArray chunk into a string using TextDecoder.
   *
   * @param value The chunk value to decode
   * @returns The decoded string
   * @throws Error if the chunk type is unsupported
   * @private
   */
  private decodeChunk(value: string | ArrayBuffer): string {
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

/**
 * Processes server-sent event data into a string AsyncIterable.
 *
 * @example
 * ```typescript
 * const eventSource = new EventSource('/api/events');
 * const processor = new EventSourceProcessor(eventSource);
 *
 * for await (const chunk of processor) {
 *   console.log('Received event data:', chunk);
 * }
 * ```
 */
export class EventSourceProcessor implements AsyncIterable<string> {
  private eventSource: EventSource;
  private abortController = new AbortController();
  private resolvePromise: (value: string | null) => void;
  private rejectPromise: (error: Error) => void;

  /**
   * Creates a new EventSourceProcessor.
   * @param eventSource The EventSource to process
   */
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

  /**
   * Aborts the processing operation, and closes the underlying connection.
   */
  stop(): void {
    this.abortController.abort();
    this.eventSource.close();
  }

  /**
   * Yields strings from server-sent events until the EventSource is closed, or
   * the processor is aborted.
   *
   * @yields String data from each server-sent event
   */
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

/**
 * Processes string, Uint8Array, or ArrayBuffer data from a WebSocket into a
 * string AsyncIterable.
 *
 * @example
 * ```typescript
 * const ws = new WebSocket('ws://localhost:8080/stream');
 * const processor = new WebSocketProcessor(ws);
 *
 * for await (const chunk of processor) {
 *   console.log('Received WebSocket message:', chunk);
 * }
 * ```
 */
export class WebSocketProcessor implements AsyncIterable<string> {
  private webSocket: WebSocket;
  private decoder = new TextDecoder();
  private abortController = new AbortController();
  private resolvePromise: (value: string | null) => void;
  private rejectPromise: (error: Error) => void;

  /**
   * Creates a new WebSocketProcessor.
   * @param webSocket The WebSocket to process
   */
  constructor(webSocket: WebSocket) {
    this.webSocket = webSocket;

    this.resolvePromise = () => {
      throw new Error(
        "WebSocket event received before WebSocketProcessor iterator initialised resolvePromise method",
      );
    };
    this.rejectPromise = () => {
      throw new Error(
        "WebSocket event received before WebSocketProcessor iterator initialised rejectPromise method",
      );
    };
  }

  /**
   * Aborts the processing operation, and closes the underlying connection.
   */
  stop(): void {
    this.abortController.abort();
    this.webSocket.close();
  }

  /**
   * Yields string data from WebSocket messages until the connection is closed,
   * or the processor is aborted. Resolves promises on WebSocket events to avoid
   * polling.
   *
   * @yields String data from each WebSocket message
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    this.webSocket.onmessage = (event: MessageEvent) => {
      try {
        this.resolvePromise(this.decodeChunk(event.data));
      } catch (error) {
        this.rejectPromise(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };

    this.webSocket.onclose = () => {
      this.resolvePromise(null); // Signal end
    };

    this.webSocket.onerror = () => {
      this.rejectPromise(new Error("WebSocket error"));
    };

    try {
      while (
        this.webSocket.readyState !== WebSocket.CLOSED &&
        !this.abortController.signal.aborted
      ) {
        const message = await new Promise<string | null>((resolve, reject) => {
          if (this.abortController.signal.aborted) {
            resolve(null);
            return;
          }
          this.resolvePromise = resolve;
          this.rejectPromise = reject;
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

  /**
   * Decodes ArrayBuffer/TypedArray message into a string using TextDecoder.
   *
   * @param value The message to decode
   * @returns The decoded string
   * @throws Error if the message type is unsupported
   * @private
   */
  private decodeChunk(value: string | ArrayBuffer): string {
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

/**
 * Processes string, Uint8Array, or ArrayBuffer data from an AsyncIterable
 * into a string AsyncIterable.
 *
 * @example
 * ```typescript
 * async function* dataGenerator() {
 *   yield '{"chunk": 1}';
 *   yield '{"chunk": 2}';
 * }
 *
 * const processor = new AsyncIterableProcessor(dataGenerator());
 * for await (const chunk of processor) {
 *   console.log('Processed chunk:', chunk);
 * }
 * ```
 */
export class AsyncIterableProcessor implements AsyncIterable<string> {
  private asyncIterable: AsyncIterable<string | Uint8Array | ArrayBuffer>;
  private abortController = new AbortController();
  private decoder = new TextDecoder();

  /**
   * Creates a new AsyncIterableProcessor.
   * @param asyncIterable - The AsyncIterable to process.
   */
  constructor(asyncIterable: AsyncIterable<string | Uint8Array | ArrayBuffer>) {
    this.asyncIterable = asyncIterable;
  }

  /**
   * Aborts the processing operation.
   */
  stop(): void {
    this.abortController.abort();
  }

  /**
   * Yields strings from the AsyncIterable until it is exhausted, or aborted.
   *
   * @yields String chunks decoded from the AsyncIterable
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    for await (const chunk of this.asyncIterable) {
      if (this.abortController.signal.aborted) {
        return;
      }

      yield this.decodeChunk(chunk);
    }
  }

  /**
   * Decodes ArrayBuffer/TypedArray data into a string using TextDecoder.
   *
   * @param value The data to decode
   * @returns The decoded string
   * @throws Error if the data type is unsupported
   * @private
   */
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

interface StreamProcessor extends AsyncIterable<string> {
  /**
   * Aborts the processing operation, and closes the underlying connection.
   */
  stop(): void;
}

/**
 * Factory class for creating appropriate stream processors based on input type.
 * Automatically detects the input type and returns the appropriate processor.
 *
 * Provides a unified interface for creating stream processors that can handle
 * ReadableStream, EventSource, WebSocket, and AsyncIterable streams.
 *
 * @example
 * ```typescript
 * // Works with different stream types
 * const fetchProcessor = StreamProcessorFactory.create(response.body);
 * const wsProcessor = StreamProcessorFactory.create(webSocket);
 * const sseProcessor = StreamProcessorFactory.create(eventSource);
 *
 * // All provide the same AsyncIterable<string> interface
 * for await (const chunk of fetchProcessor) {
 *   // Process JSON chunk
 * }
 * ```
 */
// biome-ignore lint/complexity/noStaticOnlyClass: allow
export class StreamProcessorFactory {
  /**
   * Creates a processor for ReadableStream instances.
   *
   * @param stream The ReadableStream to process
   * @returns AsyncIterable that yields strings from ReadableStream chunks
   * @private
   */
  private static forReadableStream(stream: ReadableStream): StreamProcessor {
    return new ReadableStreamProcessor(stream);
  }

  /**
   * Creates a processor for EventSource instances.
   *
   * @param eventSource The EventSource to process
   * @returns AsyncIterable that yields strings from server-sent events
   * @private
   */
  private static forEventSource(eventSource: EventSource): StreamProcessor {
    return new EventSourceProcessor(eventSource);
  }

  /**
   * Creates a processor for WebSocket instances.
   *
   * @param webSocket The WebSocket to process
   * @returns AsyncIterable that yields strings chunks from WebSocket messages
   * @private
   */
  private static forWebSocket(webSocket: WebSocket): StreamProcessor {
    return new WebSocketProcessor(webSocket);
  }

  /**
   * Creates a processor for AsyncIterables.
   *
   * @param asyncIterable The AsyncIterable to process
   * @returns AsyncIterable that yields strings from AsyncIterable data
   * @private
   */
  private static forAsyncIterable(
    asyncIterable: AsyncIterable<string | Uint8Array | ArrayBuffer>,
  ): StreamProcessor {
    return new AsyncIterableProcessor(asyncIterable);
  }

  /**
   * Instantiates the appropriate stream processor for the given input type.
   *
   * Supported input types:
   * - ReadableStream
   * - EventSource
   * - WebSocket
   * - AsyncIterable
   *
   * @param stream The stream source to process
   * @returns AsyncIterable that yields strings
   * @throws Error if the stream is null/undefined or of an unsupported type
   *
   * @example
   * ```typescript
   * // Fetch API response
   * const response = await fetch('/api/stream');
   * const processor = StreamProcessorFactory.create(response.body);
   *
   * // Server-sent events
   * const sse = new EventSource('/api/events');
   * const sseProcessor = StreamProcessorFactory.create(sse);
   *
   * // WebSocket
   * const ws = new WebSocket('ws://localhost:8080');
   * const wsProcessor = StreamProcessorFactory.create(ws);
   * ```
   */
  static create(
    stream:
      | ReadableStream
      | EventSource
      | WebSocket
      | AsyncIterable<string | Uint8Array | ArrayBuffer>,
  ): StreamProcessor {
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
