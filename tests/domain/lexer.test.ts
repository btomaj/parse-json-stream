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
    Delimiter: ";,",
    Quote: "'\"",
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

  class TestFSM extends FSM<typeof TestState, typeof TestTokenType> {
    constructor(
      transitions = testTransitions,
      initialState = TestState.Initial,
    ) {
      super(transitions, initialState);
    }
  }

  class TestLexer extends Lexer<typeof TestState, typeof TestTokenType> {
    constructor(
      states = TestState,
      transitions = testTransitions,
      testFSM = new TestFSM(transitions, TestState.Initial),
    ) {
      super(states, transitions, testFSM);
    }

    public process(): void {}

    // Expose protected methods for testing
    public testYieldToken(chunk: string) {
      return Array.from(this.yieldToken(chunk));
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

  it("should throw error when more than 32 states are provided", () => {
    // Arrange
    const tooManyStates: Record<string, string | number> & typeof TestState = {
      ...TestState,
    };
    for (let i = 0; i < 33; i++) {
      tooManyStates[`state${i}`] = `STATE_${i}`;
    }

    // Act & Assert
    expect(() => {
      new TestLexer(tooManyStates);
    }).toThrow(
      "More than 32 states, but JavaScript only supports bitwise operations up to 32 bits",
    );
  });

  it("should throw error with non-ASCII rules", () => {
    // Arrange
    const nonAsciiTransitions = [
      ...testTransitions,
      new FSMTransition(TestState.Initial, Symbol("日本語"), TestState.Initial),
    ];

    // Act & Assert
    expect(() => new TestLexer(TestState, nonAsciiTransitions)).toThrow(
      "Non-ASCII character",
    );
  });

  it("should throw error on Symbol rule when symbol description is undefined", () => {
    // Arrange
    const undefinedSymbolStateTokenTypes = [
      ...testTransitions,
      new FSMTransition(TestState.Initial, Symbol(), TestState.Initial),
    ];

    // Act & Assert
    expect(
      () => new TestLexer(TestState, undefinedSymbolStateTokenTypes),
    ).toThrow(
      "Symbol.description cannot be undefined when Symbol is used for StateTokenType.inputSymbol",
    );
  });

  it("should yield tokens from chunk", () => {
    // Arrange
    const lexer = new TestLexer();
    const testChunk = "abc123!@#";

    // Act
    const tokens = lexer.testYieldToken(testChunk);

    // Assert
    expect(tokens[0].type).toBe(TestState.Initial);
    expect(tokens[0].lexeme).toBe("abc");
    expect(tokens[1].type).toBe(TestTokenType.Numbers);
    expect(tokens[1].lexeme).toBe("1");
    expect(tokens[2].type).toBe(TestState.Numbers);
    expect(tokens[2].lexeme).toBe("23");
    expect(tokens[3].type).toBe(TestTokenType.Special);
    expect(tokens[3].lexeme).toBe("!");
    expect(tokens[4].type).toBe(TestState.Special);
    expect(tokens[4].lexeme).toBe("@#");
    expect(tokens.length).toBe(5);
  });

  it("should initialise to initial state", () => {
    // Arrange & Act
    const testFSM = new TestFSM(testTransitions, TestState.Initial);
    const lexer = new TestLexer(TestState, testTransitions, testFSM);

    // Assert
    expect(testFSM.state).toBe(TestState.Initial);
  });

  it("should not transition state in absence of rule match", () => {
    // Arrange
    const testFSM = new TestFSM(testTransitions, TestState.Initial);
    const lexer = new TestLexer(TestState, testTransitions, testFSM);

    // Act
    const tokens = lexer.testYieldToken("abc");

    // Assert
    expect(testFSM.state).toBe(TestState.Initial);
  });

  it("should transition state on rule match only", () => {
    // Arrange
    const testFSM = new TestFSM(testTransitions, TestState.Initial);
    const lexer = new TestLexer(TestState, testTransitions, testFSM);

    // Act
    const tokens = lexer.testYieldToken("1abc");

    // Assert
    expect(testFSM.state).toBe(TestState.Numbers);
  });

  it("should transition state for every rule match", () => {
    // Arrange
    const testFSM = new TestFSM(testTransitions, TestState.Initial);
    const lexer = new TestLexer(TestState, testTransitions, testFSM);

    // Act
    const tokens = lexer.testYieldToken("1!");

    // Assert
    expect(testFSM.state).toBe(TestState.Special);
  });

  it("should handle empty listener array", () => {
    // Arrange
    const lexer = new TestLexer();
    const testToken = { type: TestState.Initial, lexeme: "test" };

    // Act & Assert
    expect(() => lexer.testEmit(testToken)).not.toThrow();
  });

  it("should emit to all listeners in order", () => {
    // Arrange
    const lexer = new TestLexer();
    const order: number[] = [];
    const listener1 = vi.fn(() => order.push(1));
    const listener2 = vi.fn(() => order.push(2));
    const listener3 = vi.fn(() => order.push(3));

    lexer.testAddListener(listener1);
    lexer.testAddListener(listener2);
    lexer.testAddListener(listener3);

    const testToken = { type: TestState.Initial, lexeme: "test" };

    // Act
    lexer.testEmit(testToken);

    // Assert
    expect(order).toEqual([1, 2, 3]);
    expect(listener1).toHaveBeenCalledWith(testToken);
    expect(listener2).toHaveBeenCalledWith(testToken);
    expect(listener3).toHaveBeenCalledWith(testToken);
  });
});
