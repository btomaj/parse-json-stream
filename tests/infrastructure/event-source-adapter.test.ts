import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventSourceProcessor } from "~/lib/infrastructure/stream-adapter";

class StubEventSource extends EventSource {
  constructor(private _readyState: number) {
    super("http://test");
  }

  get readyState(): number {
    return this._readyState;
  }

  close = vi.fn();
}

describe("EventSourceAdapter", () => {
  const chunkCallback = vi.fn();
  const endCallback = vi.fn();
  const errorCallback = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Message Handling", () => {
    it("should handle multiple messages", () => {
      const stubEventSource = new StubEventSource(1); // EventSource.OPEN
      const adapter = new EventSourceProcessor(stubEventSource);
      adapter.onChunk(chunkCallback);

      adapter.start();
      stubEventSource.onmessage?.(
        new MessageEvent("message", { data: "first" }),
      );
      stubEventSource.onmessage?.(new MessageEvent("message", { data: "" }));

      expect(chunkCallback).toHaveBeenCalledWith("first");
      expect(chunkCallback).toHaveBeenCalledWith("");
      expect(chunkCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe("Error Handling", () => {
    it("should call endCallback when EventSource is closed", () => {
      const stubEventSource = new StubEventSource(2); // EventSource.CLOSED
      const adapter = new EventSourceProcessor(stubEventSource);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();
      stubEventSource.onerror?.(new Event("error"));

      expect(endCallback).toHaveBeenCalled();
      expect(errorCallback).not.toHaveBeenCalled();
    });

    it("should call errorCallback when EventSource has error but not closed", () => {
      const stubEventSource = new StubEventSource(1); // EventSource.OPEN
      const adapter = new EventSourceProcessor(stubEventSource);
      adapter.onError(errorCallback);

      adapter.start();
      stubEventSource.onerror?.(new Event("error"));

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "EventSource error",
        }),
      );
      expect(endCallback).not.toHaveBeenCalled();
    });

    it("should call errorCallback when EventSource is connecting", () => {
      const stubEventSource = new StubEventSource(0); // EventSource.CONNECTING
      const adapter = new EventSourceProcessor(stubEventSource);
      adapter.onError(errorCallback);

      adapter.start();
      stubEventSource.onerror?.(new Event("error"));

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "EventSource error",
        }),
      );
    });

    it("should handle error after successful messages", () => {
      const stubEventSource = new StubEventSource(1); // EventSource.OPEN
      const adapter = new EventSourceProcessor(stubEventSource);
      adapter.onChunk(chunkCallback);
      adapter.onError(errorCallback);

      adapter.start();
      stubEventSource.onmessage?.(
        new MessageEvent("message", { data: "success" }),
      );
      stubEventSource.onerror?.(new Event("error"));

      expect(chunkCallback).toHaveBeenCalledWith("success");
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe("Stream Control", () => {
    it("should close EventSource when stop() is called", () => {
      const stubEventSource = new StubEventSource(1); // EventSource.OPEN
      const adapter = new EventSourceProcessor(stubEventSource);

      adapter.start();
      adapter.stop();

      expect(stubEventSource.close).toHaveBeenCalled();
    });

    it("should handle stop() before start()", () => {
      const stubEventSource = new StubEventSource(1); // EventSource.OPEN
      const adapter = new EventSourceProcessor(stubEventSource);

      expect(() => adapter.stop()).not.toThrow();
      expect(stubEventSource.close).toHaveBeenCalled();
    });

    it("should handle multiple stop() calls", () => {
      const stubEventSource = new StubEventSource(1); // EventSource.OPEN
      const adapter = new EventSourceProcessor(stubEventSource);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();
      adapter.stop();
      adapter.stop();

      expect(stubEventSource.close).toHaveBeenCalledTimes(2);
    });
  });

  describe("Callback Registration", () => {
    it("should work without callbacks registered", () => {
      const stubEventSource = new StubEventSource(1); // EventSource.OPEN
      const adapter = new EventSourceProcessor(stubEventSource);

      expect(() => adapter.start()).not.toThrow();
      expect(() =>
        stubEventSource.onmessage?.(new MessageEvent("message")),
      ).not.toThrow();
    });

    it("should allow callback changes between messages", () => {
      const stubEventSource = new StubEventSource(1); // EventSource.OPEN
      const adapter = new EventSourceProcessor(stubEventSource);
      adapter.onChunk(chunkCallback);

      adapter.start();
      stubEventSource.onmessage?.(
        new MessageEvent("message", { data: "first" }),
      );

      const newChunkCallback = vi.fn();
      adapter.onChunk(newChunkCallback);
      stubEventSource.onmessage?.(
        new MessageEvent("message", { data: "second" }),
      );

      expect(chunkCallback).toHaveBeenCalledWith("first");
      expect(newChunkCallback).toHaveBeenCalledWith("second");
    });
  });
});
