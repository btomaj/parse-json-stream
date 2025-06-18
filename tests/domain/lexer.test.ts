import { afterEach, describe, expect, it, vi } from "vitest";
import { JSONLexer, JSONTokenType, Lexer } from "~/lib/domain/lexer";

describe("Abstract Lexer", () => {
  const StubClassifications = {
    Numbers: Symbol("-0123456789"),
    Special: Symbol("!@#$%^&*()_+=[]{}|:./<>?`~"),
    Delimiter: Symbol(";,"),
    Quote: Symbol("'\""),
  };
  const ClassificationsReset = { ...StubClassifications };
  afterEach(() => Object.assign(StubClassifications, ClassificationsReset));

  // Concrete test implementation of the abstract Lexer class
  class TestLexer extends Lexer<typeof StubClassifications> {
    // Expose protected methods for testing
    public process(chunk: string): void {
      super.process(chunk);
    }
    public emit(chunk: string): void {
      super.emit(chunk);
    }
  }

  it("should initialize with all ASCII characters", () => {
    const StubClassificationWithAllASCII = Object.assign(StubClassifications, {
      Letters: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    });
    // Arrange & Act
    const lexer = new TestLexer(StubClassificationWithAllASCII);

    // Assert
    expect(lexer).toBeInstanceOf(Lexer);
  });

  it("should throw error with non-ASCII character classifications", () => {
    // Arrange & Act
    const StubClassificationWithNonASCII = Object.assign(StubClassifications, {
      Special: "日本語",
    });

    // Assert
    expect(() => new TestLexer(StubClassificationWithNonASCII)).toThrow(
      "Non-ASCII character",
    );
  });

  it("should emit classifications for all lexemes in a chunk", () => {
    // Arrange
    const lexer = new TestLexer(StubClassifications);
    const testChunk = "a1b2c3";
    const listener = vi.fn();
    lexer.addListener(listener);

    // Act
    lexer.process(testChunk);

    // Assert
    expect(listener).toHaveBeenCalledTimes(testChunk.length);
    // In "a1b2c3", odd values are numbers, and even values are letters
    for (let i = 0; i < testChunk.length; i++) {
      expect(listener).toHaveBeenNthCalledWith(
        i + 1,
        i % 2 ? /* Odd */ StubClassifications.Numbers : /* Even */ testChunk[i],
      );
    }
  });

  it("should emit entire chunk for chunk without lexemes", () => {
    // Arrange
    const lexer = new TestLexer(StubClassifications);
    const testChunk = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const listener = vi.fn();
    lexer.addListener(listener);

    // Act
    lexer.process(testChunk);

    // Assert
    expect(listener).toHaveBeenCalledExactlyOnceWith(testChunk);
  });

  it("should emit empty string", () => {
    // Arrange
    const lexer = new TestLexer(StubClassifications);
    const listener = vi.fn();
    lexer.addListener(listener);

    // Act
    lexer.process("");

    // Assert
    expect(listener).toHaveBeenCalledExactlyOnceWith("");
  });

  it("should emit to all listeners", () => {
    const lexer = new TestLexer(StubClassifications);
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();

    lexer.addListener(listener1);
    lexer.addListener(listener2);
    lexer.addListener(listener3);

    lexer.emit("test");

    expect(listener1).toHaveBeenCalledWith("test");
    expect(listener2).toHaveBeenCalledWith("test");
    expect(listener3).toHaveBeenCalledWith("test");
  });

  it("should handle empty listener array", () => {
    const lexer = new TestLexer(StubClassifications);

    expect(() => lexer.emit("test")).not.toThrow();
  });

  it("should support adding multiple listeners", () => {
    const lexer = new TestLexer(StubClassifications);
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    lexer.addListener(listener1);
    lexer.addListener(listener2);

    lexer.process("!");

    expect(listener1).toHaveBeenCalledExactlyOnceWith(
      StubClassifications.Special,
    );
    expect(listener2).toHaveBeenCalledExactlyOnceWith(
      StubClassifications.Special,
    );
  });

  it("should preserve listener order", () => {
    const lexer = new TestLexer(StubClassifications);
    const order: number[] = [];

    lexer.addListener(() => order.push(1));
    lexer.addListener(() => order.push(2));
    lexer.addListener(() => order.push(3));

    lexer.emit("test");

    expect(order).toEqual([1, 2, 3]);
  });
});

describe("JSONLexer", () => {
  it("should initialize with Trigger enumerations", () => {
    // Arrange & Act
    const lexer = new JSONLexer(JSONTokenType);

    // Assert
    expect(lexer).toBeInstanceOf(Lexer);
  });

  it("should emit the escape character with the escape code", () => {
    const lexer = new JSONLexer(JSONTokenType, "@");
    const listener = vi.fn();
    lexer.addListener(listener);

    lexer.process("@");
    lexer.process("ntest");

    expect(listener).toHaveBeenNthCalledWith(1, "@n");
    expect(listener).toHaveBeenNthCalledWith(2, "test");
  });

  it.for([
    JSONTokenType.LBrace,
    JSONTokenType.RBrace,
    JSONTokenType.LBracket,
    JSONTokenType.RBracket,
    JSONTokenType.String,
    JSONTokenType.Number,
    JSONTokenType.True,
    JSONTokenType.False,
    JSONTokenType.Null,
    JSONTokenType.Colon,
    JSONTokenType.Comma,
    JSONTokenType.Escape,
    JSONTokenType.Whitespace,
  ])("should process %j correctly", (trigger) => {
    // Arrange
    const lexer = new JSONLexer(JSONTokenType);
    const listener = vi.fn();
    lexer.addListener(listener);

    // Act
    lexer.process([...trigger.toString()][0]);

    // Assert
    expect(listener).toHaveBeenCalledExactlyOnceWith(trigger);
  });

  it("should handle double escape sequence", () => {
    const lexer = new JSONLexer(JSONTokenType, JSONTokenType.Escape);
    const listener = vi.fn();
    lexer.addListener(listener);

    lexer.process(
      JSONTokenType.Escape.toString() + JSONTokenType.Escape.toString(),
    );

    expect(listener).toHaveBeenCalledExactlyOnceWith(
      JSONTokenType.Escape.toString() + JSONTokenType.Escape.toString(),
    );
  });

  describe("integration with JSON parsing", () => {
    it("should tokenize an object", () => {
      const lexer = new JSONLexer(JSONTokenType);
      const tokens: Array<string | symbol> = [];
      lexer.addListener((token) => tokens.push(token));

      lexer.process('{"key": "value"}');

      expect(tokens).toEqual([
        JSONTokenType.LBrace,
        JSONTokenType.String,
        "key",
        JSONTokenType.String,
        JSONTokenType.Colon,
        JSONTokenType.Whitespace,
        JSONTokenType.String,
        "value",
        JSONTokenType.String,
        JSONTokenType.RBrace,
      ]);
    });

    it("should properly tokenize a JSON array", () => {
      const lexer = new JSONLexer(JSONTokenType);
      const tokens: Array<string | symbol> = [];
      lexer.addListener((token) => tokens.push(token));
      // expectedOutput is "[1,2,3]"
      const expectedOutput = [
        JSONTokenType.LBracket,
        "1",
        JSONTokenType.Comma,
        "2",
        JSONTokenType.Comma,
        "3",
        JSONTokenType.RBracket,
      ];

      lexer.process(expectedOutput.map((s) => s.toString()).join(""));

      expect(tokens).toEqual(expectedOutput);
    });

    it("should properly tokenize boolean and null values", () => {
      const lexer = new JSONLexer(JSONTokenType);
      const tokens: Array<string | symbol> = [];
      lexer.addListener((token) => tokens.push(token));

      lexer.process('{"active": true, "deleted": false, "parent": null}');

      // Check that the first character of each keyword is properly classified
      expect(tokens).toContain(JSONTokenType.True); // from "true"
      expect(tokens).toContain(JSONTokenType.False); // from "false"
      expect(tokens).toContain(JSONTokenType.Null); // from "null"
    });

    it("should handle escaped quotes in strings", () => {
      // Arrange
      const lexer = new JSONLexer(JSONTokenType);
      const tokens: Array<string | symbol> = [];
      lexer.addListener((token) => tokens.push(token));
      // expectedOutput is '{"quote":"He said \\"Hello\\""}'
      const expectedOutput = [
        JSONTokenType.LBrace,
        JSONTokenType.String,
        "quote",
        JSONTokenType.String,
        JSONTokenType.Colon,
        JSONTokenType.String,
        "He said ",
        '\\"Hello',
        '\\"',
        JSONTokenType.String,
        JSONTokenType.RBrace,
      ];

      // Act
      lexer.process(expectedOutput.map((s) => s.toString()).join(""));

      // Assert
      expect(tokens).toEqual(expectedOutput);
    });

    it("should handle whitespace variations", () => {
      // Arrange
      const lexer = new JSONLexer(JSONTokenType);
      const tokens: Array<string | symbol> = [];
      lexer.addListener((token) => tokens.push(token));

      // Act
      lexer.process('{\n\t"key"\r\n:\t"value"\n}');

      // Assert
      expect(tokens).toEqual([
        JSONTokenType.LBrace,
        JSONTokenType.Whitespace,
        JSONTokenType.Whitespace,
        JSONTokenType.String,
        "key",
        JSONTokenType.String,
        JSONTokenType.Whitespace,
        JSONTokenType.Whitespace,
        JSONTokenType.Colon,
        JSONTokenType.Whitespace,
        JSONTokenType.String,
        "value",
        JSONTokenType.String,
        JSONTokenType.Whitespace,
        JSONTokenType.RBrace,
      ]);
    });

    it("should handle nested JSON structures", () => {
      // Arrange
      const lexer = new JSONLexer(JSONTokenType);
      const tokens: Array<string | symbol> = [];
      lexer.addListener((token) => tokens.push(token));
      // expectedOutput is '{"nested":{"array":[1,2]}}'
      const expectedOutput = [
        JSONTokenType.LBrace,
        JSONTokenType.String,
        "nested",
        JSONTokenType.String,
        JSONTokenType.Colon,
        JSONTokenType.LBrace,
        JSONTokenType.String,
        "array",
        JSONTokenType.String,
        JSONTokenType.Colon,
        JSONTokenType.LBracket,
        JSONTokenType.Number,
        JSONTokenType.Comma,
        JSONTokenType.Number,
        JSONTokenType.RBracket,
        JSONTokenType.RBrace,
        JSONTokenType.RBrace,
      ];

      // Act
      lexer.process(expectedOutput.map((s) => s.toString()).join(""));

      // Assert
      expect(tokens).toEqual(expectedOutput);
    });

    it("should handle JSON with Unicode escape sequences", () => {
      // Arrange
      const lexer = new JSONLexer(JSONTokenType);
      const tokens: Array<string | symbol> = [];
      lexer.addListener((token) => tokens.push(token));

      // Act
      lexer.process('{"unicode": "\\u0048\\u0065\\u006C\\u006C\\u006F"}');

      // Assert
      const result = tokens.map((s) => s.toString()).join("");
      expect(result).toBe('{"unicode": "\\u0048\\u0065\\u006C\\u006C\\u006F"}');
    });
  });
});
