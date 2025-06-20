import { StateTokenType } from "./lexer";

export class FSMTransition<S, I> extends StateTokenType<S, I> {
  constructor(
    currentState: S,
    inputSymbol: I,
    public nextState: S,
  ) {
    super(currentState, inputSymbol);
  }
}

export abstract class FSM<S, I> {
  private _state: S[keyof S];
  protected transitions: Map<
    S[keyof S],
    Map<I[keyof I], FSMTransition<S[keyof S], I[keyof I]>>
  > = new Map();

  constructor(
    transitions: Array<FSMTransition<S[keyof S], I[keyof I]>>,
    initialState: S[keyof S],
  ) {
    for (const transition of transitions) {
      let stateTransitions = this.transitions.get(transition.currentState);
      if (!stateTransitions) {
        stateTransitions = new Map();
        this.transitions.set(transition.currentState, stateTransitions);
      }
      stateTransitions.set(transition.inputSymbol, transition);
    }

    this._state = initialState;
  }

  get state(): S[keyof S] {
    return this._state;
  }

  transition(inputSymbol: I[keyof I]): FSMTransition<S[keyof S], I[keyof I]> {
    const transition = this.transitions.get(this.state)?.get(inputSymbol);
    if (!transition) {
      throw new Error(
        `No transition from state ${this.state} on ${inputSymbol}`,
      );
    }
    this._state = transition.nextState;
    return transition;
  }

  reset(state: S[keyof S]) {
    this._state = state;
  }
}

export class PDATransition<S, I> extends FSMTransition<S, I> {
  constructor(
    currentState: S,
    inputSymbol: I,
    public stackTop: S,
    nextState: S,
    public stackPush: Array<S>,
  ) {
    super(currentState, inputSymbol, nextState);
  }
}

export abstract class PDA<S, I> {
  private readonly fsm: FSM<S, I>;
  private readonly steps: Map<
    I[keyof I],
    Map<S[keyof S], Map<S[keyof S], PDATransition<S[keyof S], I[keyof I]>>>
  > = new Map();
  private readonly stack: Array<S[keyof S]> = [];

  constructor(
    FSM: new (
      transitions: Array<FSMTransition<S[keyof S], I[keyof I]>>,
      initialState: S[keyof S],
    ) => FSM<S, I>,
    steps: Array<PDATransition<S[keyof S], I[keyof I]>>,
    initialState: S[keyof S],
  ) {
    this.fsm = new FSM(steps, initialState);

    for (const step of steps) {
      if (step.stackPush.length === 0) {
        throw new Error("Stack push cannot be empty");
      }

      let stateSteps = this.steps.get(step.inputSymbol);
      if (!stateSteps) {
        stateSteps = new Map();
        this.steps.set(step.inputSymbol, stateSteps);
      }

      let stackSteps = stateSteps.get(step.currentState);
      if (!stackSteps) {
        stackSteps = new Map();
        stateSteps.set(step.currentState, stackSteps);
      }

      stackSteps.set(step.stackTop, step);
    }

    this.stack.push(initialState);
  }

  get state(): S[keyof S] {
    return this.fsm.state;
  }

  step(inputSymbol: I[keyof I]): PDATransition<S[keyof S], I[keyof I]> {
    const stackTop = this.stack.pop();
    if (!stackTop) {
      throw new Error(
        `State stack is empty on transition from currentState: ${this.state} with inputSymbol: ${inputSymbol}`,
      );
    }

    const transition = this.steps
      .get(inputSymbol)
      ?.get(this.state)
      ?.get(stackTop);
    if (!transition) {
      throw new Error(
        `No transition for currentState: ${this.state}, inputSymbol: ${inputSymbol}, stackTop: ${stackTop}`,
      );
    }

    this.fsm.transition(inputSymbol);
    this.stack.push(...transition.stackPush);

    return transition;
  }
}
