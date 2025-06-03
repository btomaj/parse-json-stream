import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadableStreamAdapter } from "../../src/stream-adapter";

class MockReadableStream extends ReadableStream<string> {
  public mockReader = {
    read: vi.fn(),
    cancel: vi.fn(),
    releaseLock: vi.fn(),
    closed: new Promise<void>((resolve) => resolve()),
  };

  getReader() {
    return this.mockReader;
  }
}

describe("ReadableStreamAdapter", () => {
  const chunkCallback = vi.fn();
  const endCallback = vi.fn();
  const errorCallback = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("String Chunks", () => {
    it("should handle multiple string chunks", async () => {
      const mockStream = new MockReadableStream();
      const adapter = new ReadableStreamAdapter(mockStream);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);

      mockStream.mockReader.read.mockResolvedValueOnce({
        done: false,
        value: "hel",
      });
      mockStream.mockReader.read.mockResolvedValueOnce({
        done: false,
        value: "lo",
      });
      mockStream.mockReader.read.mockResolvedValueOnce({ done: true });

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("hel");
      expect(chunkCallback).toHaveBeenCalledWith("lo");
      expect(endCallback).toHaveBeenCalled();
    });

    it("should handle empty string chunks", async () => {
      const mockStream = new MockReadableStream();
      const adapter = new ReadableStreamAdapter(mockStream);
      adapter.onChunk(chunkCallback);
      mockStream.mockReader.read.mockResolvedValueOnce({
        done: false,
        value: "",
      });
      mockStream.mockReader.read.mockResolvedValueOnce({
        done: false,
        value: "test",
      });
      mockStream.mockReader.read.mockResolvedValueOnce({ done: true });

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("");
      expect(chunkCallback).toHaveBeenCalledWith("test");
    });
  });

  describe("Error Handling", () => {
    it("should handle read errors", async () => {
      const mockStream = new MockReadableStream();
      const adapter = new ReadableStreamAdapter(mockStream);
      adapter.onError(errorCallback);
      const error = new Error("Read failed");
      mockStream.mockReader.read.mockRejectedValueOnce(error);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(errorCallback).toHaveBeenCalledWith(error);
    });

    it("should handle unsupported chunk types", async () => {
      const mockStream = new MockReadableStream();
      const adapter = new ReadableStreamAdapter(mockStream);
      adapter.onError(errorCallback);
      mockStream.mockReader.read.mockResolvedValueOnce({
        done: false,
        value: 123,
      });

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Unsupported chunk type"),
        }),
      );
    });
  });

  describe("Stream Control", () => {
    it("should stop and cancel reader when stop() is called", async () => {
      const mockStream = new MockReadableStream();
      const adapter = new ReadableStreamAdapter(mockStream);
      mockStream.mockReader.read.mockResolvedValue({
        done: false,
        value: "test",
      });

      adapter.start();
      adapter.stop();

      expect(mockStream.mockReader.cancel).toHaveBeenCalled();
    });

    it("should handle stop() before start()", () => {
      const mockStream = new MockReadableStream();
      const adapter = new ReadableStreamAdapter(mockStream);

      expect(() => adapter.stop()).not.toThrow();
    });
  });

  describe("Callback Registration", () => {
    it("should work without callbacks registered", async () => {
      const mockStream = new MockReadableStream();
      const adapter = new ReadableStreamAdapter(mockStream);
      mockStream.mockReader.read.mockResolvedValueOnce({
        done: false,
        value: "test",
      });
      mockStream.mockReader.read.mockResolvedValueOnce({ done: true });

      expect(() => adapter.start()).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it("should allow callback changes between chunks", async () => {
      const mockStream = new MockReadableStream();
      const adapter = new ReadableStreamAdapter(mockStream);
      adapter.onChunk(chunkCallback);
      const newChunkCallback = vi.fn();
      mockStream.mockReader.read
        .mockResolvedValueOnce({ done: false, value: "first" })
        .mockImplementationOnce(async () => {
          adapter.onChunk(newChunkCallback);
          return { done: false, value: "second" };
        })
        .mockResolvedValueOnce({ done: true });

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("first");
      expect(newChunkCallback).toHaveBeenCalledWith("second");
    });
  });

  describe("Stream Completion", () => {
    it("should call endCallback after final chunk", async () => {
      const mockStream = new MockReadableStream();
      const adapter = new ReadableStreamAdapter(mockStream);
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      mockStream.mockReader.read.mockResolvedValueOnce({
        done: false,
        value: "final",
      });
      mockStream.mockReader.read.mockResolvedValueOnce({ done: true });

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("final");
      expect(endCallback).toHaveBeenCalled();
    });
  });
});
