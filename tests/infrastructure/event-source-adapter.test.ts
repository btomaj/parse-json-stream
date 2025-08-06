import { beforeEach, expect, it, vi } from "vitest";
import { EventSourceProcessor } from "~/lib/infrastructure/stream-adapter";

class StubEventSource implements EventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;

  CONNECTING = EventSource.CONNECTING;
  OPEN = EventSource.OPEN;
  CLOSED = EventSource.CLOSED;

  constructor(private _readyState: number) {}

  get readyState(): number {
    return this._readyState;
  }

  get url(): string {
    return "";
  }

  close = vi.fn().mockImplementation(() => {
    setTimeout(() => {
      this._readyState = EventSource.CLOSED;
      this.onerror?.(new Event("error"));
    });
  });

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

  addEventListener(): void {}

  removeEventListener(): void {}

  withCredentials: boolean = false;
}

beforeEach(() => vi.resetAllMocks());

it("should handle messages", async () => {
  // Arrange
  const stubEventSource = new StubEventSource(1); // EventSource.OPEN
  const adapter = new EventSourceProcessor(stubEventSource);
  const messages: Array<string> = [];

  // Act
  stubEventSource.dispatchEvent(new MessageEvent("message", { data: "1" }));
  stubEventSource.dispatchEvent(new MessageEvent("message", { data: "" }));
  stubEventSource.dispatchEvent(new MessageEvent("message", { data: "2" }));
  stubEventSource.close();

  for await (const message of adapter) {
    messages.push(message);
  }

  // Assert
  expect(messages).toEqual(["1", "", "2"]);
});

it("should end iteration when EventSource is closed", async () => {
  // Arrange
  const stubEventSource = new StubEventSource(2); // EventSource.CLOSED
  const adapter = new EventSourceProcessor(stubEventSource);
  const messages: Array<string> = [];

  // Act
  stubEventSource.close();
  stubEventSource.dispatchEvent(new MessageEvent("message", { data: "1" }));
  for await (const message of adapter) {
    messages.push(message);
  }

  // Assert
  expect(messages).toEqual([]);
});

it("should throw error when EventSource is connecting", async () => {
  // Arrange
  const stubEventSource = new StubEventSource(0); // EventSource.CONNECTING
  const adapter = new EventSourceProcessor(stubEventSource);

  // Act
  stubEventSource.dispatchEvent(new Event("error"));
  const messages = [];

  // Assert
  await expect(async () => {
    for await (const message of adapter) {
      messages.push(message);
    }
  }).rejects.toThrow("Server-side event error");
});

it("should throw error when EventSource has error", async () => {
  // Arrange
  const stubEventSource = new StubEventSource(1); // EventSource.OPEN
  const adapter = new EventSourceProcessor(stubEventSource);
  const messages: Array<string> = [];

  // Act
  stubEventSource.dispatchEvent(
    new MessageEvent("message", { data: "success" }),
  );
  stubEventSource.dispatchEvent(new Event("error"));

  // Assert
  await expect(async () => {
    for await (const message of adapter) {
      messages.push(message);
    }
  }).rejects.toThrow("Server-side event error");
  expect(messages).toEqual(["success"]);
});

it("should close EventSource when stop() is called on EventSourceProcessor before iteration", async () => {
  // Arrange
  const stubEventSource = new StubEventSource(1); // EventSource.OPEN
  const adapter = new EventSourceProcessor(stubEventSource);

  // Act
  expect(() => adapter.stop()).not.toThrow();
  expect(() => adapter.stop()).not.toThrow(); // Assert
  for await (const _ of adapter) {
    // initialise the iterator to avoid initialisation errors
  }

  // Assert
  expect(stubEventSource.close).toHaveBeenCalledTimes(2);
});

it("should close EventSource when stop() is called on EventSourceProcessor during iteration", async () => {
  // Arrange
  const stubEventSource = new StubEventSource(1); // EventSource.OPEN
  const adapter = new EventSourceProcessor(stubEventSource);
  const messages: string[] = [];

  // Act
  stubEventSource.dispatchEvent(
    new MessageEvent("message", { data: "before" }),
  );
  setTimeout(() => adapter.stop());
  stubEventSource.dispatchEvent(new MessageEvent("message", { data: "after" }));

  for await (const message of adapter) {
    messages.push(message);
  }

  // Assert
  expect(messages).toEqual(["before"]);
  expect(stubEventSource.close).toHaveBeenCalled();
});
