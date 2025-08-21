import { describe, expect, it } from "vitest";
import { JSONChunk } from "~/lib/domain/chunk";
import {
  JSONSymbol,
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
  class FakeLexer extends Lexer<typeof JSONValue, typeof JSONSymbol> {
    returnTokens: Array<LexerToken<typeof JSONValue, typeof JSONSymbol>> = [];

    constructor(transitions = JSONTransitions, initialState = JSONValue.None) {
      super(transitions, initialState);
    }

    setReturnToken(token: LexerToken<typeof JSONValue, typeof JSONSymbol>) {
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
    lexer.setReturnToken({
      type: JSONValue.String,
      buffer: "hello",
      start: 0,
      end: 5,
    });

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
    const buffer = "[1,2]";
    const lexer = new FakeLexer();
    lexer.setReturnToken({
      type: JSONValue.None,
      symbol: JSONSymbol.LBracket,
      buffer,
      start: 0,
      end: 1,
    });
    lexer.setReturnToken({
      type: JSONValue.Number,
      buffer,
      start: 1,
      end: 2,
    });
    lexer.setReturnToken({
      type: JSONValue.None,
      symbol: JSONSymbol.Comma,
      buffer,
      start: 2,
      end: 3,
    });
    lexer.setReturnToken({
      type: JSONValue.Number,
      buffer,
      start: 3,
      end: 4,
    });
    lexer.setReturnToken({
      type: JSONValue.None,
      symbol: JSONSymbol.RBracket,
      buffer,
      start: 4,
      end: 5,
    });
    const parser = new JSONParser(lexer, JSONTransitions, JSONValue.None, [
      JSONValue.None,
    ]);

    // Act
    const chunks = Array.from(parser.parse(buffer));

    // Assert
    expect(chunks[0].segments).toEqual([0]);
    expect(chunks[1].segments).toEqual([1]);
  });

  it("should set object key", async () => {
    // Arrange
    const lexer = new FakeLexer();
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.LBrace,
      buffer: '{"key":"value"}',
      start: 0,
      end: 1,
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      buffer: '{"key":"value"}',
      start: 2,
      end: 5,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.Colon,
      buffer: '{"key":"value"}',
      start: 6,
      end: 7,
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      buffer: '{"key":"value"}',
      start: 8,
      end: 13,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.RBrace,
      buffer: '{"key":"value"}',
      start: 14,
      end: 15,
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
    expect(chunks[0].segments).toEqual(["key"]);
  });

  it("should traverse path segments for nest objects", async () => {
    // Arrange
    const lexer = new FakeLexer();
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.LBrace,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 0,
      end: 1,
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 2,
      end: 8,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.Colon,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 9,
      end: 10,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.LBrace,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 10,
      end: 11,
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 12,
      end: 15,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.Colon,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 16,
      end: 17,
    });
    lexer.setReturnToken({
      type: JSONValue.Number,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 17,
      end: 18,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.RBrace,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 18,
      end: 19,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.Comma,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 19,
      end: 20,
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 21,
      end: 27,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.Colon,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 28,
      end: 29,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.LBrace,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 29,
      end: 30,
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 31,
      end: 36,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.Colon,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 37,
      end: 38,
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 39,
      end: 44,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.Comma,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 45,
      end: 46,
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 47,
      end: 50,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.Colon,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 51,
      end: 52,
    });
    lexer.setReturnToken({
      type: JSONValue.String,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 53,
      end: 56,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.RBrace,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 57,
      end: 58,
    });
    lexer.setReturnToken({
      type: JSONValue.Object,
      symbol: JSONSymbol.RBrace,
      buffer: '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      start: 58,
      end: 59,
    });
    const parser = new JSONParser(lexer, JSONTransitions, JSONValue.None, [
      JSONValue.None,
    ]);

    // Act
    const chunks = Array.from(
      parser.parse(
        '{"number":{"one":1},"string":{"hello":"world","foo":"bar"}}',
      ),
    );

    console.log(chunks);
    // Assert
    expect(chunks[0].segments).toEqual(["number", "one"]);
    expect(chunks[1].segments).toEqual(["string", "hello"]);
    expect(chunks[2].segments).toEqual(["string", "foo"]);
  });
});
