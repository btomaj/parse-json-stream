import { describe, expect, it } from "vitest";
import {
  FSM,
  FSMTransition,
  JSONLexer,
  JSONValue,
  Lexer,
  type LexerToken,
} from "~/lib/domain/lexer";
import { JSONTransitions } from "~/lib/domain/transitions";

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
  } as const;

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
  } as const;

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

  class TestLexer extends Lexer<typeof TestState, typeof TestTokenType> {
    constructor(
      transitions = testTransitions,
      initialState = TestState.Initial,
    ) {
      super(transitions, initialState);
    }

    public *tokenise(): Generator<
      LexerToken<typeof TestState, typeof TestTokenType>
    > {}
  }

  it("should throw error when more than 32 states are provided", () => {
    // Arrange
    const tooManyTransitions = [...testTransitions];
    for (let i = 0; i < 33; i += 1) {
      tooManyTransitions.push(
        new FSMTransition(
          `STATE_${i}` as unknown as TestState,
          TestTokenType.Numbers,
          `STATE_${i + 1}` as unknown as TestState,
        ),
      );
    }

    // Act & Assert
    expect(() => {
      new TestLexer(tooManyTransitions);
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
    expect(() => new TestLexer(nonAsciiTransitions)).toThrow(
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
    expect(() => new TestLexer(undefinedSymbolStateTokenTypes)).toThrow(
      "Symbol.description cannot be undefined when Symbol is used for StateTokenType.inputSymbol",
    );
  });

  it("should initialise to initial state", () => {
    // Arrange & Act
    const lexer = new TestLexer(testTransitions, TestState.Initial);

    // Assert
    expect(lexer.state).toBe(TestState.Initial);
  });
});

describe("JSONLexer", () => {
  it("should initialize with correct state", () => {
    // Arrange & Act
    const lexer = new JSONLexer(JSONTransitions, JSONValue.None);

    // Assert
    expect(lexer.state).toBe(JSONValue.None);
  });

  it.for([
    ["{}", ["{", "}"]],
    ["{:}", ["{", ":", "}"]],
    ['{"key"}', ["{", "key", "}"]],
    ["{,}", ["{", ",", "}"]],
    ['{"key":{}}', ["{", "key", ":", "{", "}", "}"]],
    ['{"key":[]}', ["{", "key", ":", "[", "]", "}"]],
    ['{"key":"string"}', ["{", "key", ":", "string", "}"]],
    ['{"key":3.2e1}', ["{", "key", ":", "3.2e1", "}"]],
    ['{"key":-3.2e1}', ["{", "key", ":", "-3.2e1", "}"]],
    ['{"key":3.2e1,}', ["{", "key", ":", "3.2e1", ",", "}"]],
    ['{"key":-3.2e1,}', ["{", "key", ":", "-3.2e1", ",", "}"]],
    ['{"key":true}', ["{", "key", ":", "true", "}"]],
    ['{"key":true,}', ["{", "key", ":", "true", ",", "}"]],
    ['{"key":false}', ["{", "key", ":", "false", "}"]],
    ['{"key":false,}', ["{", "key", ":", "false", ",", "}"]],
    ['{"key":null}', ["{", "key", ":", "null", "}"]],
    ['{"key":null,}', ["{", "key", ":", "null", ",", "}"]],
  ])("should correctly tokenise object transition %O", ([chunk, expected]) => {
    // Arrange
    const lexer = new JSONLexer(JSONTransitions, JSONValue.None);

    // Act
    const tokens = Array.from(lexer.tokenise(chunk as string)).map((token) =>
      token.buffer.slice(token.start, token.end),
    );

    // Assert
    expect(tokens).toEqual(expected);
  });

  it.for([
    ["[]", ["[", "]"]],
    ["[,]", ["[", ",", "]"]],
    ["[[]]", ["[", "[", "]", "]"]],
    ["[{}]", ["[", "{", "}", "]"]],
    ['["string"]', ["[", "string", "]"]],
    ["[3.2e1]", ["[", "3.2e1", "]"]],
    ["[-3.2e1]", ["[", "-3.2e1", "]"]],
    ["[true]", ["[", "true", "]"]],
    ["[false]", ["[", "false", "]"]],
    ["[null]", ["[", "null", "]"]],
  ])("should correctly tokenise array transition %O", ([chunk, expected]) => {
    // Arrange
    const lexer = new JSONLexer(JSONTransitions, JSONValue.None);

    // Act
    const tokens = Array.from(lexer.tokenise(chunk as string)).map((token) =>
      token.buffer.slice(token.start, token.end),
    );

    // Assert
    expect(tokens).toEqual(expected);
  });

  it.for([
    [" ", []],
    ["{}", ["{", "}"]],
    ["[]", ["[", "]"]],
    ['""', []],
    ["1.2e-3", ["1.2e-3"]],
    ["-1.2E-3", ["-1.2E-3"]],
    ["true", ["true"]],
    ["false", ["false"]],
    ["null", ["null"]],
  ])(
    "should correctly tokenise string followed by %O",
    ([addendum, expected]) => {
      // Arrange
      const lexer = new JSONLexer(JSONTransitions, JSONValue.None);
      const string = "string";
      (expected as Array<string>).unshift(string);

      // Act
      const tokens = Array.from(lexer.tokenise(`"${string}"${addendum}`)).map(
        (token) => token.buffer.slice(token.start, token.end),
      );

      // Assert
      expect(tokens).toEqual(expected);
    },
  );

  it.for([
    [" "],
    ["{}"],
    ["[]"],
    ["1.2e-3"],
    ["-1.2E-3"],
    ["true"],
    ["false"],
    ["null"],
  ])("should correctly tokenise string containing %O", ([addendum]) => {
    // Arrange
    const lexer = new JSONLexer(JSONTransitions, JSONValue.None);
    const expected = `str${addendum}ing`;

    // Act
    const tokens = Array.from(lexer.tokenise(`"${expected}"`)).map((token) =>
      token.buffer.slice(token.start, token.end),
    );

    // Assert
    expect(tokens).toEqual([expected]);
  });

  describe.for([
    ["1"],
    ["321"],
    ["-321"],
    ["3.21"],
    ["-3.21"],
    ["3e1"],
    ["-3e1"],
    ["3e-1"],
    ["-3e-1"],
    ["3E1"],
    ["-3E1"],
    ["3E-1"],
    ["-3E-1"],
    ["3.2e1"],
    ["-3.2e1"],
    ["3.2e-1"],
    ["-3.2e-1"],
    ["3.2e1"],
    ["-3.2e1"],
    ["3.2e-1"],
    ["-3.2e-1"],
  ])("should correctly tokenise number %s", ([number]) => {
    // Arrange
    const lexer = new JSONLexer(JSONTransitions, JSONValue.None);
    it.for([
      [" ", [number]],
      ["{}", [number, "{", "}"]],
      ["[]", [number, "[", "]"]],
      ['""', [number]],
      ["-3.2e-1", [`${number}-3.2e-1`]],
      ["true", [number, "true"]],
      ["false", [number, "false"]],
      ["null", [number, "null"]],
    ])("immediately followed by %O", ([addendum, expected]) => {
      // Act
      const tokens = Array.from(lexer.tokenise(number + addendum)).map(
        (token) => token.buffer.slice(token.start, token.end),
      );

      // Assert
      expect(tokens).toEqual(expected);
    });
  });

  describe.for([
    ["123", "123"],
    ["true", "true"],
    ["false", "false"],
    ["null", "null"],
    ['"\\\\"', "\\"],
    ['"\\/"', "\/"],
    ['"\\""', '"'],
    ['"\\b"', "\b"],
    ['"\\r"', "\r"],
    ['"\\f"', "\f"],
    ['"\\n"', "\n"],
    ['"\\t"', "\t"],
    ['"\\u0041"', "A"],
  ])("should correctly tokenise %o", ([primitive, expected]) => {
    describe.for([
      [" ", [expected]],
      ["{}", [expected, "{", "}"]],
      ["[]", [expected, "[", "]"]],
      ['""', [expected]],
      // ["1.2e-3", [expected, "1.2e-3"]],
      // ["-1.2E-3", [expected, "-1.2E-3"]],
      ["true", [expected, "true"]],
      ["false", [expected, "false"]],
      ["null", [expected, "null"]],
    ])("immediately followed by %O", ([addendum, expected]) => {
      const variants = [];
      for (let chunkSize = 0; chunkSize < primitive.length; chunkSize += 1) {
        // split into two chunks based on chunk size
        if (chunkSize === 0) {
          variants.push([
            [primitive, addendum as string],
            expected as Array<string>,
          ]);
          continue;
        }
        variants.push([
          [
            primitive.slice(0, chunkSize),
            primitive.slice(chunkSize),
            addendum as string,
          ],
          expected as Array<string>,
        ]);
        // split into n chunks based on chunk size
        const numberOfChunks = Math.ceil(primitive.length / chunkSize);
        if (numberOfChunks === 1 || numberOfChunks === 2) {
          continue;
        }
        const chunks = [];
        for (let i = 0; i < numberOfChunks; i += 1) {
          chunks.push(primitive.slice(i * chunkSize, (i + 1) * chunkSize));
        }
        variants.push([
          [...chunks, addendum as string],
          expected as Array<string>,
        ]);
      }
      it.for(variants)("split across chunks #%$", ([variant, expected]) => {
        // Arrange
        const lexer = new JSONLexer(JSONTransitions, JSONValue.None);
        const tokens = [];

        // Act
        for (let i = 0; i < variant.length; i += 1) {
          tokens.push(...lexer.tokenise(variant[i]));
        }

        const primitive = tokens
          .splice(0, tokens.length - (expected.length - 1))
          .map((token) => token.buffer.slice(token.start, token.end))
          .join("");

        const addendum = tokens.map((token) => {
          return token.buffer.slice(token.start, token.end);
        });

        // Assert
        expect([primitive, ...addendum]).toEqual(expected);
      });
    },
  );

  it("should ignore whitespace surrounding lexemes", () => {
    // Arrange
    const lexer = new JSONLexer(JSONTransitions, JSONValue.None);

    // Act
    const tokens = Array.from(
      lexer.tokenise(' "string" 1 \t\n\r true false null '),
    ).map((token) => token.buffer.slice(token.start, token.end));

    // Assert
    expect(tokens).toEqual(["string", "1", "true", "false", "null"]);
  });

  it.skip("should should buffer incomplete non-string primitives", () => {
    // Arrange
    const lexer = new JSONLexer(JSONTransitions, JSONValue.None);

    // Act
    lexer.tokenise("1");
    const tokens = Array.from(lexer.tokenise("23")).map((token) =>
      token.buffer.slice(token.start, token.end),
    );

    // Assert
    expect(tokens).toEqual(["123"]);
  });
});
