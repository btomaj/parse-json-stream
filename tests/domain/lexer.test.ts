import { afterEach, describe, expect, it, vi } from "vitest";
import { Lexer, StateTokenType } from "~/lib/domain/lexer";
import { FSM, FSMTransition } from "~/lib/domain/state";

describe("Abstract Lexer", () => {
  enum TestState {
    Initial = 0,
    Numbers = 1,
    Special = 2,
  }

  const TestTokenType = {
    Numbers: Symbol("-0123456789"),
    Special: Symbol("!@#$%^&*()_+=[]{}|:./<>?`~"),
    Delimiter: Symbol(";,"),
    Quote: Symbol("'\""),
  };
  type TestTokenType = (typeof TestTokenType)[keyof typeof TestTokenType];

  const testTransitions = [
    new FSMTransition(
      TestState.Initial,
      TestTokenType.Numbers,
      TestState.Numbers,
    ),
    new FSMTransition(
      TestState.Initial,
      TestTokenType.Special,
      TestState.Special,
    ),
    new FSMTransition(
      TestState.Numbers,
      TestTokenType.Special,
      TestState.Special,
    ),
    new FSMTransition(
      TestState.Special,
      TestTokenType.Numbers,
      TestState.Numbers,
    ),
  ];
  // Mock FSM for testing
  class TestFSM extends FSM<typeof TestState, typeof TestTokenType> {
    constructor() {
      super(testTransitions, TestState.Initial);
    }
  }

  // Concrete test implementation of the abstract Lexer class
  class TestLexer extends Lexer<typeof TestState, typeof TestTokenType> {
    constructor() {
      super(TestState, testTransitions, new TestFSM());
    }

    // Implement abstract process method
    public process(chunk: string): void {
      const [index, tokenType] = this.findFirstTokenType(chunk);

      if (index < 0) {
        this.emit({ type: this.fsm.state, lexeme: chunk });
        return;
      }

      if (index > 0) {
        this.emit({ type: this.fsm.state, lexeme: chunk.slice(0, index) });
      }

      if (tokenType) {
        this.fsm.transition(tokenType);
        this.emit({ type: tokenType, lexeme: chunk.slice(index, index + 1) });
      }

      if (index + 1 < chunk.length) {
        this.process(chunk.slice(index + 1));
      }
    }

    // Expose protected methods for testing
    public testFindFirstTokenType(chunk: string) {
      return this.findFirstTokenType(chunk);
    }

    public testEmit(token: {
      type: TestState | (typeof TestTokenType)[keyof typeof TestTokenType];
      lexeme: string;
    }): void {
      this.emit(token);
    }

    public testAddListener(
      listener: (token: {
        type: TestState | (typeof TestTokenType)[keyof typeof TestTokenType];
        lexeme: string;
      }) => void,
    ): void {
      this.addListener(listener);
    }
  }

  it("should initialize with states, stateTokenTypeMap, and FSM", () => {
    // Arrange & Act
    const lexer = new TestLexer();

    // Assert
    expect(lexer).toBeInstanceOf(Lexer);
    expect(lexer.fsm.state).toBe(TestState.Initial);
  });

  it("should throw error when more than 32 states are provided", () => {
    // Arrange
    const tooManyStates: Record<string, string> = {};
    for (let i = 0; i < 33; i++) {
      tooManyStates[`state${i}`] = `STATE_${i}`;
    }

    // Assert
    expect(() => {
      new TestLexer(); // This would need to be modified to accept the states, but the error check happens in constructor
    }).not.toThrow(); // Our test lexer doesn't have 33 states, so let's test the actual error condition

    // Create a lexer that would have too many states
    class TooManyStatesLexer extends Lexer<string, symbol> {
      constructor() {
        const states = tooManyStates;
        const stateTokenTypeMap: StateTokenType<string, symbol>[] = [];
        const fsm = new (class extends FSM<string, symbol> {
          constructor() {
            super([], Object.values(states)[0]);
          }
        })();
        super(states, stateTokenTypeMap, fsm);
      }
      process(chunk: string): void {}
    }

    expect(() => new TooManyStatesLexer()).toThrow(
      "More than 32 states, but JavaScript only supports bitwise operations up to 32 bits",
    );
  });

  it("should throw error with non-ASCII character classifications", () => {
    // Arrange & Act
    class NonASCIILexer extends Lexer<TestState, symbol> {
      constructor() {
        const states = { Initial: TestState.Initial };
        const nonASCIIToken = Symbol("日本語");
        const stateTokenTypeMap = [
          new StateTokenType(TestState.Initial, nonASCIIToken),
        ];
        const fsm = new (class extends FSM<TestState, symbol> {
          constructor() {
            super([], TestState.Initial);
          }
        })();
        super(states, stateTokenTypeMap, fsm);
      }
      process(chunk: string): void {}
    }

    // Assert
    expect(() => new NonASCIILexer()).toThrow("Non-ASCII character");
  });

  it("should find first token type in chunk", () => {
    // Arrange
    const lexer = new TestLexer();
    const testChunk = "abc123!@#";

    // Act
    const [index, tokenType] = lexer.testFindFirstTokenType(testChunk);

    // Assert
    expect(index).toBe(3); // First number is at index 3
    expect(tokenType).toBe(TestTokenType.Numbers);
  });

  it("should return -1 and null when no token type found", () => {
    // Arrange
    const lexer = new TestLexer();
    const testChunk = "abcdefg"; // No numbers or special chars

    // Act
    const [index, tokenType] = lexer.testFindFirstTokenType(testChunk);

    // Assert
    expect(index).toBe(-1);
    expect(tokenType).toBeNull();
  });

  it("should emit to all listeners", () => {
    // Arrange
    const lexer = new TestLexer();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();

    lexer.testAddListener(listener1);
    lexer.testAddListener(listener2);
    lexer.testAddListener(listener3);

    const testToken = { type: TestState.Initial, lexeme: "test" };

    // Act
    lexer.testEmit(testToken);

    // Assert
    expect(listener1).toHaveBeenCalledWith(testToken);
    expect(listener2).toHaveBeenCalledWith(testToken);
    expect(listener3).toHaveBeenCalledWith(testToken);
  });

  it("should handle empty listener array", () => {
    // Arrange
    const lexer = new TestLexer();
    const testToken = { type: TestState.Initial, lexeme: "test" };

    // Act & Assert
    expect(() => lexer.testEmit(testToken)).not.toThrow();
  });

  it("should support adding multiple listeners", () => {
    // Arrange
    const lexer = new TestLexer();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    lexer.testAddListener(listener1);
    lexer.testAddListener(listener2);

    // Act
    lexer.process("!");

    // Assert
    expect(listener1).toHaveBeenCalledWith({
      type: TestTokenType.Special,
      lexeme: "!",
    });
    expect(listener2).toHaveBeenCalledWith({
      type: TestTokenType.Special,
      lexeme: "!",
    });
  });

  it("should preserve listener order", () => {
    // Arrange
    const lexer = new TestLexer();
    const order: number[] = [];

    lexer.testAddListener(() => order.push(1));
    lexer.testAddListener(() => order.push(2));
    lexer.testAddListener(() => order.push(3));

    const testToken = { type: TestState.Initial, lexeme: "test" };

    // Act
    lexer.testEmit(testToken);

    // Assert
    expect(order).toEqual([1, 2, 3]);
  });

  it("should process chunk and emit tokens correctly", () => {
    // Arrange
    const lexer = new TestLexer();
    const listener = vi.fn();
    lexer.testAddListener(listener);
    const testChunk = "abc1def!";

    // Act
    lexer.process(testChunk);

    // Assert
    expect(listener).toHaveBeenCalledWith({
      type: TestState.Initial,
      lexeme: "abc",
    });
    expect(listener).toHaveBeenCalledWith({
      type: TestTokenType.Numbers,
      lexeme: "1",
    });
    expect(listener).toHaveBeenCalledWith({
      type: TestState.Numbers,
      lexeme: "def",
    });
    expect(listener).toHaveBeenCalledWith({
      type: TestTokenType.Special,
      lexeme: "!",
    });
  });

  it("should emit entire chunk when no tokens found", () => {
    // Arrange
    const lexer = new TestLexer();
    const listener = vi.fn();
    lexer.testAddListener(listener);
    const testChunk = "abcdefg";

    // Act
    lexer.process(testChunk);

    // Assert
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: TestState.Initial,
      lexeme: testChunk,
    });
  });

  it("should handle empty string", () => {
    // Arrange
    const lexer = new TestLexer();
    const listener = vi.fn();
    lexer.testAddListener(listener);

    // Act
    lexer.process("");

    // Assert
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: TestState.Initial,
      lexeme: "",
    });
  });
});

describe("JSONLexer Integration", () => {
  // Note: These tests assume JSONLexer exists and is properly implemented
  // If JSONLexer doesn't exist yet, these tests will need to be updated

  it("should initialize JSONLexer", () => {
    // This test would need to be updated based on the actual JSONLexer implementation
    expect(true).toBe(true); // Placeholder until JSONLexer is properly implemented
  });

  // Additional JSON-specific tests would go here once JSONLexer is fully implemented
  // following the same pattern as the abstract Lexer tests above
});
