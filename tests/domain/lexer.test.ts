import { afterEach, describe, expect, it, vi } from "vitest";
import { FSM, FSMTransition, Lexer, type LexerToken } from "~/lib/domain/lexer";

describe("FSM", () => {
  enum TestState {
    Initial = 0,
    A = 1,
    B = 2,
    Final = 3,
  }

  const TestInputSymbol = {
    Zero: Symbol("0"),
    One: Symbol("1"),
    Two: Symbol("2"),
  };
  type TestInputSymbol = (typeof TestInputSymbol)[keyof typeof TestInputSymbol];

  const testTransitions = [
    new FSMTransition(TestState.Initial, TestInputSymbol.Zero, TestState.A),
    new FSMTransition(TestState.Initial, TestInputSymbol.One, TestState.B),
    new FSMTransition(TestState.A, TestInputSymbol.One, TestState.Final),
    new FSMTransition(TestState.B, TestInputSymbol.Zero, TestState.Final),
  ];

  class TestFSM extends FSM<typeof TestState, typeof TestInputSymbol> {}

  it("should initialize to initial state", () => {
    // Arrange & Act
    const fsm = new TestFSM(testTransitions, TestState.A);

    // Assert
    expect(fsm.state).toBe(TestState.A);
  });

  it("should transitions states", () => {
    // Arrange
    const fsm = new TestFSM(testTransitions, TestState.Initial);

    // Act
    fsm.transition(TestInputSymbol.Zero);
    const transition = fsm.transition(TestInputSymbol.One);

    // Assert
    expect(transition.currentState).toBe(TestState.A);
    expect(transition.inputSymbol).toBe(TestInputSymbol.One);
    expect(transition.nextState).toBe(TestState.Final);
    expect(fsm.state).toBe(TestState.Final);
  });

  it("should throw error when no transition exists", () => {
    // Arrange
    const fsm = new TestFSM(testTransitions, TestState.Initial);

    // Act & Assert
    expect(() => fsm.transition(TestInputSymbol.Two)).toThrow(
      `No transition from state ${TestState.Initial} on ${TestInputSymbol.Two.toString()}`,
    );
  });

  it("should reset state to specified state", () => {
    // Arrange
    const fsm = new TestFSM(testTransitions, TestState.Initial);
    fsm.transition(TestInputSymbol.Zero);
    expect(fsm.state).toBe(TestState.A);

    // Act
    fsm.reset(TestState.B);

    // Assert
    expect(fsm.state).toBe(TestState.B);
  });
});

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
      initialState = TestState.Initial,
    ) {
      super(states, transitions, initialState);
    }

    public async *tokenise(): AsyncGenerator<LexerToken<typeof TestState>> {}

    // Expose protected methods for testing
    public testYieldToken(chunk: string) {
      return Array.from(this.yieldToken(chunk));
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
    expect(tokens[1].type).toBe(TestState.Numbers);
    expect(tokens[1].lexeme).toBe("1");
    expect(tokens[2].type).toBe(TestState.Numbers);
    expect(tokens[2].lexeme).toBe("23");
    expect(tokens[3].type).toBe(TestState.Special);
    expect(tokens[3].lexeme).toBe("!");
    expect(tokens[4].type).toBe(TestState.Special);
    expect(tokens[4].lexeme).toBe("@#");
    expect(tokens.length).toBe(5);
  });

  it("should initialise to initial state", () => {
    // Arrange & Act
    const lexer = new TestLexer(TestState, testTransitions, TestState.Initial);

    // Assert
    expect(lexer.state).toBe(TestState.Initial);
  });

  it("should not transition state in absence of rule match", () => {
    // Arrange
    const lexer = new TestLexer(TestState, testTransitions, TestState.Initial);

    // Act
    const tokens = lexer.testYieldToken("abc");

    // Assert
    expect(lexer.state).toBe(TestState.Initial);
  });

  it("should transition state on rule match only", () => {
    // Arrange
    const lexer = new TestLexer(TestState, testTransitions, TestState.Initial);

    // Act
    const tokens = lexer.testYieldToken("1abc");

    // Assert
    expect(lexer.state).toBe(TestState.Numbers);
  });

  it("should transition state for every rule match", () => {
    // Arrange
    const lexer = new TestLexer(TestState, testTransitions, TestState.Initial);

    // Act
    const tokens = lexer.testYieldToken("1!");

    // Assert
    expect(lexer.state).toBe(TestState.Special);
  });
});
