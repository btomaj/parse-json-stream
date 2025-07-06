import { describe, expect, it } from "vitest";
import { JSONChunk } from "~/lib/domain/chunk";
import {
  JSONTokenType,
  JSONValue,
  Lexer,
  type LexerToken,
} from "~/lib/domain/lexer";
import { DPDA, DPDATransition, JSONParser } from "~/lib/domain/parser";
import { JSONTransitions } from "~/lib/domain/transitions";

describe("DPDA", () => {
  enum TestState {
    Initial = 0,
    Matching = 1,
    Final = 2,
  }

  const TestInputSymbol = {
    Open: Symbol("("),
    Close: Symbol(")"),
    End: Symbol("$"),
  } as const;

  const testTransitions = [
    // From bottom marker: push open paren marker on open paren
    new DPDATransition(
      TestState.Initial,
      TestInputSymbol.Open,
      TestState.Initial,
      TestState.Initial,
      [TestState.Initial, TestState.Matching],
    ),
    // From open paren marker: push another open paren marker on open paren
    new DPDATransition(
      TestState.Initial,
      TestInputSymbol.Open,
      TestState.Matching,
      TestState.Initial,
      [TestState.Matching, TestState.Matching],
    ),
    // From open paren marker: consume it on close paren (reveal what's underneath)
    new DPDATransition(
      TestState.Initial,
      TestInputSymbol.Close,
      TestState.Matching,
      TestState.Initial,
      [], // Pop OpenParen, push nothing - effectively consuming it
    ),
    // Accept when we see end symbol and only bottom marker on stack
    new DPDATransition(
      TestState.Initial,
      TestInputSymbol.End,
      TestState.Initial,
      TestState.Final,
      [TestState.Final],
    ),
  ];

  class TestDPDA extends DPDA<
    typeof TestState,
    typeof TestInputSymbol,
    typeof TestState
  > {}

  it("should initialize to initial state", () => {
    // Arrange & Act
    const dpda = new TestDPDA(testTransitions, TestState.Initial, [
      TestState.Initial,
    ]);

    // Assert
    expect(dpda.state).toBe(TestState.Initial);
  });

  it("should transition states", () => {
    // Arrange
    const dpda = new TestDPDA(testTransitions, TestState.Initial, [
      TestState.Initial,
    ]);

    // Act
    dpda.transition(TestInputSymbol.Open);
    dpda.transition(TestInputSymbol.Close);
    dpda.transition(TestInputSymbol.Open);
    dpda.transition(TestInputSymbol.Open);
    dpda.transition(TestInputSymbol.Close);
    dpda.transition(TestInputSymbol.Close);
    const transition = dpda.transition(TestInputSymbol.End);

    // Assert
    expect(transition.currentState).toBe(TestState.Initial);
    expect(transition.inputSymbol).toBe(TestInputSymbol.End);
    expect(transition.stackTop).toBe(TestState.Initial);
    expect(transition.nextState).toBe(TestState.Final);
    expect(transition.stackPush).toEqual([TestState.Final]);
    expect(dpda.state).toBe(TestState.Final);
  });

  it("should throw error when stack is empty", () => {
    // Arrange
    const emptyStackTransitions = [
      new DPDATransition(
        TestState.Initial,
        TestInputSymbol.Open,
        TestState.Initial,
        TestState.Matching,
        [],
      ),
    ];
    const dpda = new TestDPDA(emptyStackTransitions, TestState.Initial, [
      TestState.Initial,
    ]);
    dpda.transition(TestInputSymbol.Open);

    // Act & Assert
    expect(() => dpda.transition(TestInputSymbol.Open)).toThrow(
      `State stack is empty on transition from currentState: ${TestState.Matching} with inputSymbol: ${TestInputSymbol.Open.toString()}`,
    );
  });

  it("should throw error when no transition exists", () => {
    // Arrange
    const dpda = new TestDPDA([], TestState.Initial, [TestState.Initial]);

    // Act & Assert
    expect(() => dpda.transition(TestInputSymbol.Close)).toThrow(
      `No transition for currentState: ${TestState.Initial}, inputSymbol: ${TestInputSymbol.Close.toString()}, stackTop: ${TestState.Initial}`,
    );
  });

  it("should restore stack when transition fails", () => {
    // Arrange
    const dpda = new TestDPDA(testTransitions, TestState.Initial, [
      TestState.Initial,
    ]);
    dpda.transition(TestInputSymbol.Open);
    expect(() => dpda.transition(TestInputSymbol.End)).toThrow(
      `No transition for currentState: ${TestState.Initial}, inputSymbol: ${TestInputSymbol.End.toString()}, stackTop: ${TestState.Matching}`,
    );

    // Act & Assert
    expect(() => dpda.transition(TestInputSymbol.Open)).not.toThrow(); // Still no valid transition, but stack was restored
  });

  it("should throw error on unbalanced parentheses", () => {
    // Arrange
    const dpda = new TestDPDA(testTransitions, TestState.Initial, [
      TestState.Initial,
    ]);

    // Act & Assert - trying to close without matching open should fail
    expect(() => dpda.transition(TestInputSymbol.Close)).toThrow(
      `No transition for currentState: ${TestState.Initial}, inputSymbol: ${TestInputSymbol.Close.toString()}, stackTop: ${TestState.Initial}`,
    );
  });
});

describe("JSONParser", () => {
  class FakeLexer extends Lexer<typeof JSONValue, typeof JSONTokenType> {
    returnTokens: Array<LexerToken<typeof JSONValue, typeof JSONTokenType>> =
      [];

    constructor(
      states = JSONValue,
      transitions = JSONTransitions,
      initialState = JSONValue.None,
    ) {
      super(states, transitions, initialState);
    }

    setReturnToken(token: LexerToken<typeof JSONValue, typeof JSONTokenType>) {
      this.returnTokens.push(token);
    }

    *tokenise() {
      for (const returnToken of this.returnTokens) {
        yield returnToken;
      }
    }
  }

  it("should initialise to initial state", () => {
    const parser = new JSONParser(
      new FakeLexer(),
      JSONTransitions,
      JSONValue.None,
      [JSONValue.None],
    );
    expect(parser.state).toBe(JSONValue.None);
  });

  it("should return JSONChunk from parse()", async () => {
    // Arrange
    const lexer = new FakeLexer();
    const parser = new JSONParser(lexer, JSONTransitions, JSONValue.None, [
      JSONValue.None,
    ]);
    lexer.setReturnToken({ type: JSONValue.String, lexeme: '"' });

    // Act
    const chunks = [];
    for await (const chunk of parser.parse('"hello"')) {
      chunks.push(chunk);
    }

    // Assert
    expect(chunks[0]).toBeInstanceOf(JSONChunk);
  });

  it("should set and increment array index", async () => {
    // Arrange
    const lexer = new FakeLexer();
    lexer.setReturnToken({
      type: JSONValue.Array,
      symbol: JSONTokenType.LBracket,
      lexeme: "[",
    });
    lexer.setReturnToken({ type: JSONValue.Number, lexeme: "1" });
    lexer.setReturnToken({
      type: JSONValue.Array,
      symbol: JSONTokenType.Comma,
      lexeme: ",",
    });
    lexer.setReturnToken({ type: JSONValue.Number, lexeme: "2" });
    lexer.setReturnToken({
      type: JSONValue.Array,
      symbol: JSONTokenType.RBracket,
      lexeme: "]",
    });
    const parser = new JSONParser(lexer, JSONTransitions, JSONValue.None, [
      JSONValue.None,
    ]);

    // Act
    const chunks = [];
    for await (const chunk of parser.parse("[1,2]")) {
      chunks.push(chunk);
    }

    // Assert
    expect(chunks[0].segments).toEqual(["0"]);
    expect(chunks[1].segments).toEqual(["0"]);
    expect(chunks[2].segments).toEqual(["1"]);
    expect(chunks[3].segments).toEqual(["1"]);
    expect(chunks[4].segments).toEqual([]);
  });

  it("should set object key", async () => {
    // Arrange
    const lexer = new FakeLexer();
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONTokenType.LBrace,
      lexeme: "{",
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      symbol: JSONTokenType.String,
      lexeme: '"',
    });
    lexer.setReturnToken({ type: JSONValue.String, lexeme: "key" });
    lexer.setReturnToken({
      type: JSONValue.String,
      symbol: JSONTokenType.String,
      lexeme: '"',
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONTokenType.Colon,
      lexeme: ":",
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      symbol: JSONTokenType.String,
      lexeme: '"',
    });
    lexer.setReturnToken({ type: JSONValue.String, lexeme: "value" });
    lexer.setReturnToken({
      type: JSONValue.String,
      symbol: JSONTokenType.String,
      lexeme: '"',
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONTokenType.RBrace,
      lexeme: "}",
    });
    const parser = new JSONParser(lexer, JSONTransitions, JSONValue.None, [
      JSONValue.None,
    ]);

    // Act
    const chunks = [];
    for await (const chunk of parser.parse('{"key":"value"}')) {
      chunks.push(chunk);
    }

    // Assert
    expect(chunks[2].segments).toEqual([]);
    expect(chunks[3].segments).toEqual(["key"]);
    expect(chunks[5].segments).toEqual(["key"]);
    expect(chunks[6].segments).toEqual(["key"]);
    expect(chunks[7].segments).toEqual(["key"]);
    expect(chunks[8].segments).toEqual([]);
  });

  it("should remove path segments when nesting shrinks", async () => {
    // Arrange
    const lexer = new FakeLexer();
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONTokenType.LBrace,
      lexeme: "{",
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      symbol: JSONTokenType.String,
      lexeme: '"',
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      symbol: JSONTokenType.String,
      lexeme: "key",
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      symbol: JSONTokenType.String,
      lexeme: '"',
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONTokenType.Colon,
      lexeme: ":",
    });
    lexer.setReturnToken({
      type: JSONValue.Array,
      symbol: JSONTokenType.LBracket,
      lexeme: "[",
    });
    lexer.setReturnToken({
      type: JSONValue.Number,
      symbol: JSONTokenType.Digit,
      lexeme: "1",
    });
    lexer.setReturnToken({
      type: JSONValue.Array,
      symbol: JSONTokenType.Comma,
      lexeme: ",",
    });
    lexer.setReturnToken({
      type: JSONValue.Number,
      symbol: JSONTokenType.Digit,
      lexeme: "1",
    });
    lexer.setReturnToken({
      type: JSONValue.Array,
      symbol: JSONTokenType.RBracket,
      lexeme: "]",
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONTokenType.RBrace,
      lexeme: "}",
    });
    const parser = new JSONParser(lexer, JSONTransitions, JSONValue.None, [
      JSONValue.None,
    ]);

    // Act
    const chunks = [];
    for await (const chunk of parser.parse('{"key":[1,1]}')) {
      chunks.push(chunk);
    }

    // Assert
    expect(chunks[2].segments).toEqual([]);
    expect(chunks[3].segments).toEqual(["key"]);
    expect(chunks[5].segments).toEqual(["key", 0]);
    expect(chunks[6].segments).toEqual(["key", 0]);
    expect(chunks[7].segments).toEqual(["key", 1]);
    expect(chunks[8].segments).toEqual(["key", 1]);
    expect(chunks[9].segments).toEqual(["key"]);
    expect(chunks[10].segments).toEqual([]);
  });
});
