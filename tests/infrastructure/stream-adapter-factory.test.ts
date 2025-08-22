import { describe, expect, it } from "vitest";
import {
  AsyncIterableProcessor,
  EventSourceProcessor,
  ReadableStreamProcessor,
  StreamProcessorFactory,
  WebSocketProcessor,
} from "~/lib/infrastructure/stream-adapter";

const mockWebSocket = Object.create(WebSocket.prototype) as WebSocket;
class MockAsyncIterable implements AsyncIterable<string> {
  async *[Symbol.asyncIterator]() {
    yield "test";
  }
}

describe("should detect and return valid adapter interface for", () => {
  it("ReadableStream", () => {
    const adapter = StreamProcessorFactory.create(new ReadableStream());
    expect(adapter).toBeInstanceOf(ReadableStreamProcessor);
  });

  // Can't mock EventSource's constructor and pass the instanceof test, so we skip
  it.skip("EventSource", () => {
    const adapter = StreamProcessorFactory.create(new EventSource(""));
    expect(adapter).toBeInstanceOf(EventSourceProcessor);
  });

  it("WebSocket", () => {
    const adapter = StreamProcessorFactory.create(mockWebSocket);
    expect(adapter).toBeInstanceOf(WebSocketProcessor);
  });

  it("AsyncIterable", () => {
    const adapter = StreamProcessorFactory.create(new MockAsyncIterable());
    expect(adapter).toBeInstanceOf(AsyncIterableProcessor);
  });
});

it.for([
  [undefined],
  ["string"],
  [123],
  [true],
  [false],
  [null],
  [{ notAStream: true }],
  [[]],
])("should throw for %o", ([input]) => {
  expect(() => StreamProcessorFactory.create(input as never)).toThrow();
});
