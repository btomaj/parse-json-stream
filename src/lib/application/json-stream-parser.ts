import type { JSONParserUseCase } from "~/lib/application/parser";

export interface JsonStreamHandler {
  onObjectStart(path: (string | number)[]): void;
  onObjectEnd(path: (string | number)[]): void;
  onArrayStart(path: (string | number)[]): void;
  onArrayEnd(path: (string | number)[]): void;
  onKey(path: (string | number)[], key: string): void;
  onValue(path: (string | number)[], value: string): void;
  onChunk(path: (string | number)[], chunk: string): void;
}

export class ParseJSONStreamUseCase {
  constructor(private parser: JSONParserUseCase) {}

  processChunk(chunk: string): void {
    this.automaton.push(chunk);
  }

  getCurrentPath(): (string | number)[] {
    return this.automaton.getPath();
  }

  private handleEvent(event: JsonEvent): void {
    switch (event.type) {
      case "start":
        if (this.isObjectPath(event.path)) {
          this.handler.onObjectStart?.(event.path);
        } else {
          this.handler.onArrayStart?.(event.path);
        }
        break;
      case "end":
        if (this.isObjectPath(event.path)) {
          this.handler.onObjectEnd?.(event.path);
        } else {
          this.handler.onArrayEnd?.(event.path);
        }
        break;
      case "key":
        this.handler.onKey?.(event.path, event.data!);
        break;
      case "value":
        this.handler.onValue?.(event.path, event.data!);
        break;
      case "chunk":
        this.handler.onChunk?.(event.path, event.data!);
        break;
    }
  }

  private isObjectPath(path: (string | number)[]): boolean {
    return path.length === 0 || typeof path[path.length - 1] === "string";
  }
}
