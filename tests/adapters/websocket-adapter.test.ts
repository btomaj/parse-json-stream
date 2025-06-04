import { getResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketAdapter } from "../../src/stream-adapter";

class StubWebSocket extends WebSocket {
  public onmessage = vi.fn();
  public onclose = vi.fn();
  public onerror = vi.fn();
  public close = vi.fn();

  constructor(private _readyState: number) {
    super("wss://test");
  }

  get readyState() {
    return this._readyState;
  }
}

describe("WebSocketAdapter", () => {
  const chunkCallback = vi.fn();
  const endCallback = vi.fn();
  const errorCallback = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Message Handling", () => {
    it("should handle multiple messages", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();

      stubWebSocket.onmessage({ data: "first" });
      stubWebSocket.onmessage({ data: "second" });
      stubWebSocket.onmessage({ data: "third" });

      expect(chunkCallback).toHaveBeenCalledWith("first");
      expect(chunkCallback).toHaveBeenCalledWith("second");
      expect(chunkCallback).toHaveBeenCalledWith("third");
      expect(chunkCallback).toHaveBeenCalledTimes(3);
    });

    it("should handle empty messages", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();

      stubWebSocket.onmessage({ data: "" });
      stubWebSocket.onmessage({ data: "content" });

      expect(chunkCallback).toHaveBeenCalledWith("");
      expect(chunkCallback).toHaveBeenCalledWith("content");
    });

    it("should error on non-string data", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();

      const blobData = new Blob(["binary"]);

      expect(() => stubWebSocket.onmessage({ data: blobData })).toThrowError(
        "Unsupported chunk type for JSON stream",
      );
      expect(chunkCallback).not.toHaveBeenCalled();
    });

    it("should handle ArrayBuffer data", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onError(errorCallback);

      adapter.start();

      const text = "test";
      const encoder = new TextEncoder();
      const bufferData = encoder.encode(text).buffer;

      stubWebSocket.onmessage({ data: bufferData });

      expect(chunkCallback).toHaveBeenCalledWith(text);
      expect(errorCallback).not.toHaveBeenCalled();
    });
  });

  describe("Connection Close Handling", () => {
    it("should call endCallback when WebSocket closes normally", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();

      stubWebSocket.onclose({ code: 1000, reason: "Normal closure" });

      expect(endCallback).toHaveBeenCalled();
      expect(errorCallback).not.toHaveBeenCalled();
    });

    it("should call endCallback when WebSocket closes with error code", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();

      stubWebSocket.onclose({ code: 1006, reason: "Abnormal closure" });

      expect(endCallback).toHaveBeenCalled();
    });

    it("should call endCallback after successful messages", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();

      stubWebSocket.onmessage({ data: "success" });
      stubWebSocket.onclose({ code: 1000 });

      expect(chunkCallback).toHaveBeenCalledWith("success");
      expect(endCallback).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should call errorCallback when WebSocket has error", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();

      stubWebSocket.onerror({});

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "WebSocket error",
        }),
      );
    });
  });

  describe("Stream Control", () => {
    it("should close WebSocket when stop() is called", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();
      adapter.stop();

      expect(stubWebSocket.close).toHaveBeenCalled();
    });

    it("should handle stop() before start()", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      expect(() => adapter.stop()).not.toThrow();
      expect(stubWebSocket.close).toHaveBeenCalled();
    });

    it("should handle multiple stop() calls", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();
      adapter.stop();
      adapter.stop();

      expect(stubWebSocket.close).toHaveBeenCalledTimes(2);
    });
  });

  describe("Callback Registration", () => {
    it("should work without callbacks registered", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);

      expect(() => adapter.start()).not.toThrow();
      expect(() => stubWebSocket.onmessage({ data: "test" })).not.toThrow();
    });

    it("should allow callback changes between messages", () => {
      const stubWebSocket = new StubWebSocket(1); // WebSocket.OPEN
      const adapter = new WebSocketAdapter(stubWebSocket);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      const newChunkCallback = vi.fn();

      adapter.start();
      stubWebSocket.onmessage({ data: "first" });

      adapter.onChunk(newChunkCallback);
      stubWebSocket.onmessage({ data: "second" });

      expect(chunkCallback).toHaveBeenCalledWith("first");
      expect(newChunkCallback).toHaveBeenCalledWith("second");
    });
  });
});
