import { expect, it } from "vitest";
import { AsyncIterableProcessor } from "~/lib/infrastructure/stream-adapter";

it("should handle string values", async () => {
  // Arrange
  async function* StubAsyncIterable() {
    yield "first";
    yield "second";
    yield "third";
  }
  const adapter = new AsyncIterableProcessor(StubAsyncIterable());
  const chunks: Array<string> = [];

  // Act
  for await (const chunk of adapter) {
    chunks.push(chunk);
  }

  // Assert
  expect(chunks).toEqual(["first", "second", "third"]);
});

it("should handle Uint8Array values", async () => {
  // Arrange
  async function* StubAsyncIterable() {
    yield new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    yield new Uint8Array([32, 87, 111, 114, 108, 100]); // " World"
  }
  const adapter = new AsyncIterableProcessor(StubAsyncIterable());
  const chunks: Array<string> = [];

  // Act
  for await (const chunk of adapter) {
    chunks.push(chunk);
  }

  // Assert
  expect(chunks).toEqual(["Hello", " World"]);
});

it("should handle ArrayBuffer values", async () => {
  // Arrange
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
  const chunks: Array<string> = [];

  // Act
  for await (const chunk of adapter) {
    chunks.push(chunk);
  }

  // Assert
  expect(chunks).toEqual(["Hello", " World"]);
});

it("should handle stop() during iteration", async () => {
  // Arrange
  async function* StubAsyncIterable() {
    yield "1";
    yield "2";
    yield "3";
  }
  const adapter = new AsyncIterableProcessor(StubAsyncIterable());
  const chunks: Array<string> = [];

  // Act
  for await (const chunk of adapter) {
    chunks.push(chunk);
    if (chunk === "2") {
      adapter.stop();
    }
  }

  // Assert
  expect(chunks).toEqual(["1", "2"]);
});

it.for([[123], [undefined], [null], [true], [false], [{ key: "value" }]])(
  "should error on a %s value",
  async ([value]) => {
    // Arrange
    async function* StubAsyncIterable() {
      yield value;
    }
    // @ts-ignore
    const adapter = new AsyncIterableProcessor(StubAsyncIterable());

    // Act & Assert
    expect(async () => {
      await adapter[Symbol.asyncIterator]().next();
    }).rejects.toThrow("Unsupported chunk type for JSON stream");
  },
);
