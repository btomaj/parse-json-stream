import type { JSONTokenType } from "./lexer";

export class JSONChunk {
  constructor(
    private readonly _value: string,
    private readonly _type: JSONTokenType,
    private readonly _segments: ReadonlyArray<string | number>,
  ) {}

  get value(): string {
    return this._value;
  }

  get type(): JSONTokenType {
    return this._type;
  }

  get pointer(): string {
    return `/${this._segments
      .map((s) => String(s).replace(/~/g, "~0").replace(/\//g, "~1"))
      .join("/")}`;
  }

  get path(): string {
    return `$${this._segments
      .map((s) => (typeof s === "number" ? `[${s}]` : `.${s}`))
      .join("")}`;
  }

  get segments(): Array<string | number> {
    return [...this._segments];
  }
}
