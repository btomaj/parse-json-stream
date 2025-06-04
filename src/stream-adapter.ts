export interface StreamAdapter {
  onChunk(callback: (chunk: string) => void): void;
  onEnd(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
  start(): void;
  stop(): void;
}

export class ReadableStreamAdapter implements StreamAdapter {
  private reader: ReadableStreamDefaultReader<
    string | Uint8Array | ArrayBuffer
  >;
  private decoder = new TextDecoder();
  private chunkCallback?: (chunk: string) => void;
  private endCallback?: () => void;
  private errorCallback?: (error: Error) => void;

  constructor(
    private stream: ReadableStream<string | Uint8Array | ArrayBuffer>,
  ) {
    this.reader = this.stream.getReader();
  }

  onChunk(callback: (chunk: string) => void): void {
    this.chunkCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  start(): void {
    this.read();
  }

  stop(): void {
    this.reader.cancel();
  }

  private async read(): Promise<void> {
    try {
      while (true) {
        const { done, value } = await this.reader.read();

        if (done) {
          this.endCallback?.();
          break;
        }

        const chunk = this.decodeChunk(value);
        this.chunkCallback?.(chunk);
      }
    } catch (error) {
      this.errorCallback?.(error as Error);
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

export class EventSourceAdapter implements StreamAdapter {
  private chunkCallback?: (chunk: string) => void;
  private endCallback?: () => void;
  private errorCallback?: (error: Error) => void;

  constructor(private eventSource: EventSource) {}

  onChunk(callback: (chunk: string) => void): void {
    this.chunkCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  start(): void {
    this.eventSource.onmessage = (event) => {
      this.chunkCallback?.(event.data);
    };

    this.eventSource.onerror = () => {
      const CLOSED =
        typeof EventSource !== "undefined" ? EventSource.CLOSED : 2;
      if (this.eventSource.readyState === CLOSED) {
        this.endCallback?.();
      } else {
        this.errorCallback?.(new Error("EventSource error"));
      }
    };
  }

  stop(): void {
    this.eventSource.close();
  }
}

export class WebSocketAdapter implements StreamAdapter {
  private chunkCallback?: (chunk: string) => void;
  private endCallback?: () => void;
  private errorCallback?: (error: Error) => void;
  private decoder = new TextDecoder();

  constructor(private webSocket: WebSocket) {}

  onChunk(callback: (chunk: string) => void): void {
    this.chunkCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  start(): void {
    this.webSocket.onmessage = (event) => {
      const chunk = this.decodeChunk(event.data);
      this.chunkCallback?.(chunk);
    };

    this.webSocket.onclose = () => {
      this.endCallback?.();
    };

    this.webSocket.onerror = () => {
      this.errorCallback?.(new Error("WebSocket error"));
    };
  }

  stop(): void {
    this.webSocket.close();
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

export class AsyncIterableAdapter implements StreamAdapter {
  private chunkCallback?: (chunk: string) => void;
  private endCallback?: () => void;
  private errorCallback?: (error: Error) => void;
  private abortController = new AbortController();
  private decoder = new TextDecoder();

  constructor(private asyncIterable: AsyncIterable<string | Uint8Array | ArrayBuffer>) {}

  onChunk(callback: (chunk: string) => void): void {
    this.chunkCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  start(): void {
    this.consume();
  }

  stop(): void {
    this.abortController.abort();
  }

  private async consume(): Promise<void> {
    try {
      for await (const chunk of this.asyncIterable) {
        if (this.abortController.signal.aborted) break;

        const decodedChunk = this.decodeChunk(chunk);
        this.chunkCallback?.(decodedChunk);
      }

      if (!this.abortController.signal.aborted) {
        this.endCallback?.();
      }
    } catch (error) {
      if (!this.abortController.signal.aborted) {
        this.errorCallback?.(error as Error);
      }
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

// biome-ignore lint/complexity/noStaticOnlyClass:
export class StreamAdapterFactory {
  private static forReadableStream(stream: ReadableStream): StreamAdapter {
    return new ReadableStreamAdapter(stream);
  }

  private static forEventSource(eventSource: EventSource): StreamAdapter {
    return new EventSourceAdapter(eventSource);
  }

  private static forWebSocket(webSocket: WebSocket): StreamAdapter {
    return new WebSocketAdapter(webSocket);
  }

  private static forAsyncIterable(
    asyncIterable: AsyncIterable<string | Uint8Array | ArrayBuffer>,
  ): StreamAdapter {
    return new AsyncIterableAdapter(asyncIterable);
  }

  static create(
    stream: ReadableStream | EventSource | WebSocket | AsyncIterable<string | Uint8Array | ArrayBuffer>,
  ): StreamAdapter {
    if (typeof stream === "undefined" || stream === null) {
      throw new Error("Stream is undefined or null");
    }

    if (stream instanceof ReadableStream) {
      return this.forReadableStream(stream);
    }

    if (typeof EventSource !== "undefined" && stream instanceof EventSource) {
      return this.forEventSource(stream);
    }

    if (typeof WebSocket !== "undefined" && stream instanceof WebSocket) {
      return this.forWebSocket(stream);
    }

    if (typeof stream[Symbol.asyncIterator] === "function") {
      return this.forAsyncIterable(stream);
    }

    throw new Error("Unsupported stream type");
  }
}
