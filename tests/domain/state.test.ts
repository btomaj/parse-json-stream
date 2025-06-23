import { describe, expect, it } from "vitest";
import { DPDA, DPDATransition, FSM, FSMTransition } from "~/lib/domain/state";

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
  type TestInputSymbol = (typeof TestInputSymbol)[keyof typeof TestInputSymbol];

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
