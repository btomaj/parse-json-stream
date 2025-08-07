import { expect, it, vi } from "vitest";
import { WebSocketProcessor } from "~/lib/infrastructure/stream-adapter";

class StubWebSocket implements WebSocket {
  onopen: ((this: WebSocket, ev: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  CONNECTING = WebSocket.CONNECTING;
  OPEN = WebSocket.OPEN;
  CLOSING = WebSocket.CLOSING;
  CLOSED = WebSocket.CLOSED;

  constructor(private _readyState: number) {}

  get readyState() {
    return this._readyState;
  }

  close = vi.fn().mockImplementation((code: number = 1000, reason?: string) => {
    setTimeout(() => {
      this._readyState = WebSocket.CLOSED;
      this.onclose?.({ code, reason } as CloseEvent);
    });
  });

  bufferedAmount: number = 0;
  binaryType: BinaryType = "arraybuffer";
  extensions: string = "";
  protocol: string = "";
  url: string = "";

  dispatchEvent(event: Event): boolean {
    setTimeout(() => {
      switch (event.type) {
        case "message":
          this.onmessage?.(event as MessageEvent);
          break;
        case "error":
          this.onerror?.(event);
          break;
        case "open":
          this.onopen?.(event);
          break;
      }
    });
    return true;
  }

  addEventListener() {}
  removeEventListener() {}

  send() {}
}

it("should handle string values", async () => {
  // Arrange
  const stubWebSocket = new StubWebSocket(WebSocket.OPEN);
  const adapter = new WebSocketProcessor(stubWebSocket);
  const chunks: Array<string> = [];

  // Act
  stubWebSocket.dispatchEvent(new MessageEvent("message", { data: "" }));
  stubWebSocket.dispatchEvent(new MessageEvent("message", { data: "1" }));
  stubWebSocket.dispatchEvent(new MessageEvent("message", { data: "2" }));
  stubWebSocket.dispatchEvent(new MessageEvent("message", { data: "3" }));
  stubWebSocket.close();

  for await (const chunk of adapter) {
    chunks.push(chunk);
  }

  // Assert
  expect(chunks).toEqual(["", "1", "2", "3"]);
});

it("should handle Uint8Array messages", async () => {
  // Arrange
  const stubWebSocket = new StubWebSocket(WebSocket.OPEN);
  const adapter = new WebSocketProcessor(stubWebSocket);
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode("Hello");
  const chunks: Array<string> = [];

  // Act
  stubWebSocket.dispatchEvent(
    new MessageEvent("message", { data: uint8Array }),
  );
  stubWebSocket.close();
  for await (const chunk of adapter) {
    chunks.push(chunk);
  }

  // Assert
  expect(chunks).toEqual(["Hello"]);
});

it("should handle ArrayBuffer values", async () => {
  // Arrange
  const stubWebSocket = new StubWebSocket(WebSocket.OPEN);
  const adapter = new WebSocketProcessor(stubWebSocket);
  const encoder = new TextEncoder();
  const buffer1 = encoder.encode("Hello").buffer;
  const buffer2 = encoder.encode(" World").buffer;
  const chunks: Array<string> = [];

  // Act
  stubWebSocket.dispatchEvent(new MessageEvent("message", { data: buffer1 }));
  stubWebSocket.dispatchEvent(new MessageEvent("message", { data: buffer2 }));
  stubWebSocket.close();
  for await (const chunk of adapter) {
    chunks.push(chunk);
  }

  // Assert
  expect(chunks).toEqual(["Hello", " World"]);
});

it.for([
  [123],
  [undefined],
  [true],
  [false],
  [null],
  [{ key: "value" }],
  [new Blob(["binary"])],
])("should error on %s value", async ([value]) => {
  // Arrange
  const stubWebSocket = new StubWebSocket(WebSocket.OPEN);
  const adapter = new WebSocketProcessor(stubWebSocket);

  // Act
  stubWebSocket.dispatchEvent(new MessageEvent("message", { data: value }));

  await expect(async () => {
    for await (const _ of adapter) {
    }
  }).rejects.toThrow("Unsupported chunk type for JSON stream");
});

it("should throw error when WebSocket has error", async () => {
  // Arrange
  const stubWebSocket = new StubWebSocket(WebSocket.OPEN);
  const adapter = new WebSocketProcessor(stubWebSocket);
  const chunks: Array<string> = [];

  // Act
  stubWebSocket.dispatchEvent(new MessageEvent("message", { data: "success" }));
  stubWebSocket.dispatchEvent(new Event("error"));

  // Assert
  await expect(async () => {
    for await (const chunk of adapter) {
      chunks.push(chunk);
    }
  }).rejects.toThrow("WebSocket error");
  expect(chunks).toEqual(["success"]);
});

it("should close WebSocket when stop() is called", async () => {
  // Arrange
  const stubWebSocket = new StubWebSocket(WebSocket.OPEN);
  const adapter = new WebSocketProcessor(stubWebSocket);

  // Act
  adapter.stop();
  adapter.stop();

  // Assert
  expect(stubWebSocket.close).toHaveBeenCalledTimes(2);
});
