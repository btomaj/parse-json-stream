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

export abstract class FSM<
  S extends Record<string, string | number>,
  I extends Record<string, string | symbol>,
> {
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
        `No transition from state ${this.state} on ${inputSymbol.toString()}`,
      );
    }
    this._state = transition.nextState;
    return transition;
  }

  reset(state: S[keyof S]) {
    this._state = state;
  }
}

export class DPDATransition<S, I> extends FSMTransition<S, I> {
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

export abstract class DPDA<
  S extends Record<string, string | number>,
  I extends Record<string, string | symbol>,
> {
  private _state: S[keyof S];
  private readonly transitions: Map<
    S[keyof S],
    Map<I[keyof I], Map<S[keyof S], DPDATransition<S[keyof S], I[keyof I]>>>
  > = new Map();
  private readonly stack: Array<S[keyof S]> = [];

  constructor(
    transitions: Array<DPDATransition<S[keyof S], I[keyof I]>>,
    initialState: S[keyof S],
  ) {
    this._state = initialState;

    for (const transition of transitions) {
      let stateTransitions = this.transitions.get(transition.currentState);
      if (!stateTransitions) {
        stateTransitions = new Map();
        this.transitions.set(transition.currentState, stateTransitions);
      }

      let stackTransitions = stateTransitions.get(transition.inputSymbol);
      if (!stackTransitions) {
        stackTransitions = new Map();
        stateTransitions.set(transition.inputSymbol, stackTransitions);
      }

      stackTransitions.set(transition.stackTop, transition);
    }

    this.stack.push(initialState);
  }

  get state(): S[keyof S] {
    return this._state;
  }

  get stackDepth(): number {
    return this.stack.length;
  }

  transition(inputSymbol: I[keyof I]): DPDATransition<S[keyof S], I[keyof I]> {
    const stackTop = this.stack.pop();
    if (typeof stackTop === "undefined") {
      throw new Error(
        `State stack is empty on transition from currentState: ${this.state} with inputSymbol: ${inputSymbol.toString()}`,
      );
    }

    const transition = this.transitions
      .get(this.state)
      ?.get(inputSymbol)
      ?.get(stackTop);
    if (!transition) {
      this.stack.push(stackTop);
      throw new Error(
        `No transition for currentState: ${this.state}, inputSymbol: ${inputSymbol.toString()}, stackTop: ${stackTop}`,
      );
    }

    this._state = transition.nextState;
    this.stack.push(...transition.stackPush);

    return transition;
  }
}
