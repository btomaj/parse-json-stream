import { http, ws } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  AsyncIterableProcessor,
  EventSourceProcessor,
  ReadableStreamProcessor,
  StreamProcessorFactory,
  WebSocketProcessor,
} from "~/lib/infrastructure/stream-adapter";

// Mock ReadableStream that extends the real class
class MockReadableStream extends ReadableStream<string> {
  constructor() {
    super({
      start(controller) {
        controller.enqueue("test");
        controller.close();
      },
    });
  }
}

class MockEventSource extends EventSource {
  constructor() {
    super("http://test");
  }
  close = vi.fn();
}

// @ts-ignore WebSocket does exist
class MockWebSocket extends WebSocket {
  constructor() {
    super("wss://test");
  }
  close = vi.fn();
}

class MockAsyncIterable implements AsyncIterable<string> {
  async *[Symbol.asyncIterator]() {
    yield "test";
  }
}

describe("StreamAdapterFactory", () => {
  const server = setupServer(
    http.get("http://test.com", () => {
      console.log("EventSource client connecting...");
    }),
  );
  const wss = ws.link("wss://test.com");
  wss.addEventListener("connection", () => {
    console.log("WebSocket client connecting...");
  });

  beforeAll(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  describe("should detect and return valid adapter interface for", () => {
    it("ReadableStream", () => {
      const adapter = StreamProcessorFactory.create(new MockReadableStream());

      expect(adapter).toBeInstanceOf(ReadableStreamProcessor);
    });

    it("EventSource", () => {
      const adapter = StreamProcessorFactory.create(new MockEventSource());

      expect(adapter).toBeInstanceOf(EventSourceProcessor);
    });

    it("WebSocket", () => {
      const adapter = StreamProcessorFactory.create(new MockWebSocket());

      expect(adapter).toBeInstanceOf(WebSocketProcessor);
    });

    it("AsyncIterable", () => {
      const adapter = StreamProcessorFactory.create(new MockAsyncIterable());
      expect(adapter).toBeInstanceOf(AsyncIterableProcessor);
    });

    it("async generator", () => {
      async function* generator() {
        yield "test";
      }

      const adapter = StreamProcessorFactory.create(generator());
      expect(adapter).toBeInstanceOf(AsyncIterableProcessor);
    });
  });

  describe("should throw for", () => {
    const invalidInputs = [
      { input: null, name: "null" },
      { input: undefined, name: "undefined" },
      { input: "string", name: "string" },
      { input: 123, name: "number" },
      { input: true, name: "boolean" },
      { input: {}, name: "plain object" },
      { input: [], name: "array" },
      { input: { notAStream: true }, name: "object without stream interface" },
    ];

    for (const { input, name } of invalidInputs) {
      it(`${name}`, () => {
        expect(() => StreamProcessorFactory.create(input as never)).toThrow();
      });
    }
  });
});
