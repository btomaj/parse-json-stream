import { beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncIterableProcessor } from "../../src/stream-adapter";

describe("AsyncIterableAdapter", () => {
  const chunkCallback = vi.fn();
  const endCallback = vi.fn();
  const errorCallback = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Basic Iteration", () => {
    it("should handle multiple values", async () => {
      async function* StubAsyncIterable() {
        yield "first";
        yield "second";
        yield "third";
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("first");
      expect(chunkCallback).toHaveBeenCalledWith("second");
      expect(chunkCallback).toHaveBeenCalledWith("third");
      expect(chunkCallback).toHaveBeenCalledTimes(3);
      expect(endCallback).toHaveBeenCalled();
    });

    it("should handle empty iterable", async () => {
      async function* StubAsyncIterable() {
        // Empty generator
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).not.toHaveBeenCalled();
      expect(endCallback).toHaveBeenCalled();
    });

    it("should handle async delays between values", async () => {
      async function* StubAsyncIterable() {
        yield "immediate";
        await new Promise((resolve) => setTimeout(resolve, 10));
        yield "delayed";
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(chunkCallback).toHaveBeenCalledWith("immediate");
      expect(chunkCallback).toHaveBeenCalledWith("delayed");
      expect(endCallback).toHaveBeenCalled();
    });
  });

  describe("Data Type Handling", () => {
    it("should error on non-string and non-binary values", async () => {
      async function* StubAsyncIterable() {
        yield "before error";
        yield 123;
      }

      // @ts-ignore
      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("before error");
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            "Unsupported chunk type for JSON stream",
          ),
        }),
      );
      expect(endCallback).not.toHaveBeenCalled();
    });

    it("should handle string values as-is", async () => {
      async function* StubAsyncIterable() {
        yield "plain string";
        yield "";
        yield '{"json": "string"}';
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("plain string");
      expect(chunkCallback).toHaveBeenCalledWith("");
      expect(chunkCallback).toHaveBeenCalledWith('{"json": "string"}');
    });

    it("should error on undefined values", async () => {
      async function* StubAsyncIterable() {
        yield undefined;
      }

      // @ts-ignore
      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            "Unsupported chunk type for JSON stream",
          ),
        }),
      );
      expect(chunkCallback).not.toHaveBeenCalled();
    });

    it("should error on object values", async () => {
      async function* StubAsyncIterable() {
        yield { key: "value" };
      }

      // @ts-ignore
      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            "Unsupported chunk type for JSON stream",
          ),
        }),
      );
    });

    it("should error on null values", async () => {
      async function* StubAsyncIterable() {
        yield null;
      }

      // @ts-ignore
      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            "Unsupported chunk type for JSON stream",
          ),
        }),
      );
    });

    it("should handle Uint8Array values by decoding to string", async () => {
      async function* StubAsyncIterable() {
        yield new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
        yield new Uint8Array([32, 87, 111, 114, 108, 100]); // " World"
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("Hello");
      expect(chunkCallback).toHaveBeenCalledWith(" World");
      expect(chunkCallback).toHaveBeenCalledTimes(2);
      expect(endCallback).toHaveBeenCalled();
    });

    it("should handle ArrayBuffer values by decoding to string", async () => {
      async function* StubAsyncIterable() {
        const buffer1 = new ArrayBuffer(5);
        const view1 = new Uint8Array(buffer1);
        view1.set([72, 101, 108, 108, 111]); // "Hello"
        yield buffer1;

        const buffer2 = new ArrayBuffer(6);
        const view2 = new Uint8Array(buffer2);
        view2.set([32, 87, 111, 114, 108, 100]); // " World"
        yield buffer2;
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("Hello");
      expect(chunkCallback).toHaveBeenCalledWith(" World");
      expect(chunkCallback).toHaveBeenCalledTimes(2);
      expect(endCallback).toHaveBeenCalled();
    });

    it("should handle mixed string and binary data", async () => {
      async function* StubAsyncIterable() {
        yield "start";
        yield new Uint8Array([32, 45, 32]); // " - "
        yield "end";
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("start");
      expect(chunkCallback).toHaveBeenCalledWith(" - ");
      expect(chunkCallback).toHaveBeenCalledWith("end");
      expect(endCallback).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle errors thrown by iterator", async () => {
      async function* StubAsyncIterable() {
        yield "before error";
        throw new Error("Iterator error");
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);
      adapter.onError(errorCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("before error");
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Iterator error",
        }),
      );
      expect(endCallback).not.toHaveBeenCalled();
    });

    it("should handle async errors", async () => {
      async function* StubAsyncIterable() {
        yield "success";
        await new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Async error")), 10),
        );
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onError(errorCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(chunkCallback).toHaveBeenCalledWith("success");
      expect(errorCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Async error",
        }),
      );
    });
  });

  describe("Stream Control", () => {
    it("should stop consuming when stop() is called", async () => {
      let stopCalled = false;
      async function* StubAsyncIterable() {
        yield "first";
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (stopCalled) return;
        yield "second";
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);

      adapter.start();
      await new Promise((resolve) => setTimeout(resolve, 5));
      stopCalled = true;
      adapter.stop();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(chunkCallback).toHaveBeenCalledWith("first");
      expect(chunkCallback).not.toHaveBeenCalledWith("second");
      expect(endCallback).not.toHaveBeenCalled();
    });

    it("should handle stop() before start()", () => {
      async function* StubAsyncIterable() {
        yield "test";
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());

      expect(() => adapter.stop()).not.toThrow();
    });

    it("should handle multiple stop() calls", async () => {
      async function* StubAsyncIterable() {
        yield "test";
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.start();

      expect(() => {
        adapter.stop();
        adapter.stop();
      }).not.toThrow();
    });
  });

  describe("Callback Registration", () => {
    it("should work without callbacks registered", async () => {
      async function* StubAsyncIterable() {
        yield "test";
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());

      expect(() => adapter.start()).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it("should allow callback changes during iteration", async () => {
      const newChunkCallback = vi.fn();
      let resumeGenerator: (value: unknown) => void = (value: unknown) => {
        throw new Error(
          "resumeGenerator was called before being reassigned in generator",
        );
      };

      async function* StubAsyncIterable() {
        yield "first";
        await new Promise((resolver) => {
          resumeGenerator = resolver;
        });
        yield "second";
      }

      const adapter = new AsyncIterableProcessor(StubAsyncIterable());
      adapter.onChunk(chunkCallback);
      adapter.onEnd(endCallback);

      adapter.start();

      // Wait for first chunk to be processed
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Change callback and then continue generator
      adapter.onChunk(newChunkCallback);
      resumeGenerator(undefined);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(chunkCallback).toHaveBeenCalledWith("first");
      expect(newChunkCallback).toHaveBeenCalledWith("second");
    });
  });
});
