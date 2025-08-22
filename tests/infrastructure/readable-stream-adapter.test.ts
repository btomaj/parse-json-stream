import { expect, it } from "vitest";
import { ReadableStreamProcessor } from "~/lib/infrastructure/stream-adapter";

class MockReadableStream<T = string> extends ReadableStream<T> {
  private controller!: ReadableStreamDefaultController<T>;

  constructor() {
    let controllerRef!: ReadableStreamDefaultController<T>;

    super({
      start(controller) {
        controllerRef = controller;
      },
    });

    this.controller = controllerRef;
  }

  enqueue(chunk: T) {
    this.controller.enqueue(chunk);
  }

  error(error: Error) {
    this.controller.error(error);
  }

  close() {
    this.controller.close();
  }
}

it("should handle string values", async () => {
  // Arrange
  const mockReadableStream = new MockReadableStream();
  const adapter = new ReadableStreamProcessor(mockReadableStream);
  const chunks: Array<string> = [];

  // Act
  mockReadableStream.enqueue("");
  mockReadableStream.enqueue("hello");
  mockReadableStream.close();
  for await (const chunk of adapter) {
    chunks.push(chunk);
  }

  // Assert
  expect(chunks).toEqual(["", "hello"]);
});

it("should handle Uint8Array values", async () => {
  // Arrange
  const mockReadableStream = new MockReadableStream<Uint8Array>();
  const adapter = new ReadableStreamProcessor(mockReadableStream);
  const chunks: Array<string> = [];
  const textEncoder = new TextEncoder();
  const uint8Array = textEncoder.encode("hello");

  // Act
  mockReadableStream.enqueue(uint8Array);
  mockReadableStream.close();
  for await (const chunk of adapter) {
    chunks.push(chunk);
  }

  // Assert
  expect(chunks).toEqual(["hello"]);
});

it("should handle ArrayBuffer values", async () => {
  // Arrange
  const mockReadableStream = new MockReadableStream<ArrayBuffer>();
  const adapter = new ReadableStreamProcessor(mockReadableStream);
  const chunks: Array<string> = [];
  const textEncoder = new TextEncoder();
  const buffer = textEncoder.encode("world").buffer;

  // Act
  mockReadableStream.enqueue(buffer);
  mockReadableStream.close();
  for await (const chunk of adapter) {
    chunks.push(chunk);
  }

  // Assert
  expect(chunks).toEqual(["world"]);
});

it("should handle stream errors", async () => {
  // Arrange
  const mockReadableStream = new MockReadableStream();
  const adapter = new ReadableStreamProcessor(mockReadableStream);
  const errorMessage = "test error";

  // Act
  mockReadableStream.error(new Error(errorMessage));

  // Assert
  await expect(async () => {
    for await (const _ of adapter) {
      // Should not reach here
    }
  }).rejects.toThrow(errorMessage);
});

it.for([[123], [undefined], [true], [false], [null], [{ key: "value" }]])(
  "should error on a %s value",
  async ([value]) => {
    // Arrange
    const mockReadableStream = new MockReadableStream();
    const adapter = new ReadableStreamProcessor(mockReadableStream);
    // @ts-ignore
    mockReadableStream.enqueue(value);
    mockReadableStream.close();

    await expect(async () => {
      for await (const _ of adapter) {
        // Should not reach here
      }
    }).rejects.toThrow("Unsupported chunk type");
  },
);
