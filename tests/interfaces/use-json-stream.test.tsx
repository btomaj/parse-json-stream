"@vitest-environment jsdom";

import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { JSONChunk } from "~/index";
import * as parseStream from "~/index";
import { useJSONStream } from "~/use-json-stream";

const mockParseStream = vi.spyOn(parseStream, "parseStream");

const mockAnimationFrameTimeouts = new Map();
let mockAnimationFrameRequestId = 1;
const mockRequestAnimationFrame = vi.fn((callback) => {
  const requestId = mockAnimationFrameRequestId++;
  const timeoutId = setTimeout(callback, 0);
  mockAnimationFrameTimeouts.set(requestId, timeoutId);
  return requestId;
});
const mockCancelAnimationFrame = vi.fn((requestId) => {
  const timeoutId = mockAnimationFrameTimeouts.get(requestId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    mockAnimationFrameTimeouts.delete(requestId);
  }
});
vi.stubGlobal("requestAnimationFrame", mockRequestAnimationFrame);
vi.stubGlobal("cancelAnimationFrame", mockCancelAnimationFrame);

class MockJSONChunk {
  constructor(
    public _buffer: string,
    public _start: number,
    public _end: number,
    public _segments: Array<string | number> = [],
    public _type = "string",
  ) {
    this._buffer = JSON.stringify(_buffer);
  }
  get segments() {
    return this._segments;
  }
}

const msw = setupServer(
  http.get("json-stream/empty/", () => {
    return HttpResponse.json();
  }),
  http.get("json-stream/error", () => {
    return new HttpResponse(null, {
      status: 500,
      statusText: "Server Error",
    });
  }),
  http.get<{ segments: Array<string> }>(
    "json-stream/:segments+",
    ({ params }) => {
      const { segments } = params;
      const stream = new ReadableStream({
        start(controller) {
          for (const segment of segments) {
            controller.enqueue(JSON.stringify(segment));
          }
          controller.close();
        },
      });
      return new HttpResponse(stream, {
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-cache",
        },
      });
    },
  ),
  http.post("json-stream/success/*", () => {
    return HttpResponse.json("POST");
  }),
);

beforeAll(() => {
  msw.listen({
    onUnhandledRequest: "error",
  });
});
beforeEach(() => {
  vi.clearAllMocks();
  msw.resetHandlers();
});
afterAll(() => msw.close());

it("should fetch, buffer, and process JSON stream chunks", async () => {
  // Arrange
  const bufferProcessorSpy = vi.fn();
  const { result } = renderHook(() => useJSONStream(bufferProcessorSpy));

  // Act
  result.current.fetchJSONStream("json-stream/successful/stream/with/chunks");

  // Assert
  await waitFor(() => {
    expect(bufferProcessorSpy).toHaveBeenCalledWith([
      new MockJSONChunk("successful", 1, 11),
      new MockJSONChunk("stream", 1, 7),
      new MockJSONChunk("with", 1, 5),
      new MockJSONChunk("chunks", 1, 7),
    ]);
  });

  expect(mockParseStream).toHaveBeenCalledWith(expect.any(ReadableStream), {
    signal: expect.any(AbortSignal),
  });
  expect(mockRequestAnimationFrame).toHaveBeenCalled();
});

it("should error on network error", async () => {
  // Arrange
  const bufferProcessorSpy = vi.fn();
  const { result } = renderHook(() => useJSONStream(bufferProcessorSpy));
  const testUrl = "json-stream/error";
  let testError: Error;

  // Act
  result.current.fetchJSONStream(testUrl).catch((error) => {
    testError = error;
  });

  // Assert
  await waitFor(() => {
    expect(testError).toEqual(
      new Error(`Fetch failed from ${testUrl}: HTTP 500 Server Error`),
    );
  });
});

it("should error on missing JSON in response body", async () => {
  // Arrange
  const bufferProcessorSpy = vi.fn();
  const { result } = renderHook(() => useJSONStream(bufferProcessorSpy));
  const testUrl = "json-stream/empty/";
  let testError: Error;

  // Act
  result.current.fetchJSONStream(testUrl).catch((error) => {
    testError = error;
  });

  // Assert
  await waitFor(() => {
    expect(testError).toEqual(
      new Error(`Fetch failed from ${testUrl}: HTTP 200 OK`),
    );
  });
});

it("should abort previous requests when new request is made", async () => {
  // Arrange
  const bufferProcessorSpy = vi.fn();
  const abortSpy = vi.spyOn(AbortController.prototype, "abort");

  const { result } = renderHook(() => useJSONStream(bufferProcessorSpy));

  // Act
  result.current.fetchJSONStream("json-stream/success/");
  result.current.fetchJSONStream("json-stream/success/");

  // Assert
  expect(abortSpy).toHaveBeenCalled();
});

it("should pass fetch options to the request", async () => {
  // Arrange
  const bufferProcessorSpy = vi.fn();
  const { result } = renderHook(() => useJSONStream(bufferProcessorSpy));
  const fetchOptions = {
    method: "POST",
  };

  // Act
  result.current.fetchJSONStream("json-stream/success/", fetchOptions);

  // Assert
  await waitFor(() => {
    expect(bufferProcessorSpy).toHaveBeenCalledWith([
      new MockJSONChunk("POST", 1, 5),
    ]);
  });
});

it("should reset chunk buffer between animation frames", async () => {
  // Arrange
  const bufferProcessorSpy = vi.fn();
  const mockChunk1 = new MockJSONChunk("chunk1", 1, 7);
  const mockChunk2 = new MockJSONChunk("chunk2", 1, 7);
  const mockChunk3 = new MockJSONChunk("chunk3", 1, 7);

  const mockParseStreamGenerator = async function* () {
    yield mockChunk1;
    yield mockChunk2;

    // Wait for animation frame to queue second batch
    await new Promise((resolve) =>
      requestAnimationFrame(() => resolve(undefined)),
    );

    yield mockChunk3;
  };
  mockParseStream.mockReturnValue(
    mockParseStreamGenerator() as AsyncGenerator<JSONChunk>,
  );

  const { result } = renderHook(() => useJSONStream(bufferProcessorSpy));

  // Act
  result.current.fetchJSONStream("json-stream/stream");

  // Assert
  await waitFor(() => {
    expect(bufferProcessorSpy).toHaveBeenCalledTimes(2);
  });
  expect(bufferProcessorSpy.mock.calls[0][0]).toEqual([mockChunk1, mockChunk2]);
  expect(bufferProcessorSpy.mock.calls[1][0]).toEqual([mockChunk3]);
});
