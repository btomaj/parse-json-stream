import { StateTokenType } from "./lexer";

export class FSMTransition<State, Input> extends StateTokenType<State, Input> {
  constructor(
    currentState: State,
    inputSymbol: Input,
    public nextState: State,
  ) {
    super(currentState, inputSymbol);
  }
}

export abstract class FSM<
  State extends Record<string, string | number | symbol>,
  Input extends Record<string, string | symbol>,
> {
  private _state: State[keyof State];
  protected transitions: Map<
    State[keyof State],
    Map<
      Input[keyof Input],
      FSMTransition<State[keyof State], Input[keyof Input]>
    >
  > = new Map();

  constructor(
    transitions: Array<FSMTransition<State[keyof State], Input[keyof Input]>>,
    initialState: State[keyof State],
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

  get state(): State[keyof State] {
    return this._state;
  }

  transition(
    inputSymbol: Input[keyof Input],
  ): FSMTransition<State[keyof State], Input[keyof Input]> {
    const transition = this.transitions.get(this.state)?.get(inputSymbol);
    if (!transition) {
      throw new Error(
        `No transition from state ${this.state.toString()} on ${inputSymbol.toString()}`,
      );
    }
    this._state = transition.nextState;
    return transition;
  }

  reset(state: State[keyof State]) {
    this._state = state;
  }
}

export class DPDATransition<State, Input, Stack> extends FSMTransition<
  State,
  Input
> {
  constructor(
    currentState: State,
    inputSymbol: Input,
    public stackTop: Stack,
    nextState: State,
    public stackPush: Array<Stack>,
  ) {
    super(currentState, inputSymbol, nextState);
  }
}

export abstract class DPDA<
  State extends Record<string, string | number | symbol>,
  Input extends Record<string, string | symbol>,
  Stack extends Record<string, string | number | symbol>,
> {
  private _state: State[keyof State];
  private readonly transitions: Map<
    State[keyof State],
    Map<
      Input[keyof Input],
      Map<
        Stack[keyof Stack],
        DPDATransition<
          State[keyof State],
          Input[keyof Input],
          Stack[keyof Stack]
        >
      >
    >
  > = new Map();
  private readonly stack: Array<Stack[keyof Stack]> = [];

  constructor(
    transitions: Array<
      DPDATransition<State[keyof State], Input[keyof Input], Stack[keyof Stack]>
    >,
    initialState: State[keyof State],
    initialStack: Array<Stack[keyof Stack]>,
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

    this.stack.push(...initialStack);
  }

  get state(): State[keyof State] {
    return this._state;
  }

  get stackDepth(): number {
    return this.stack.length;
  }

  transition(
    inputSymbol: Input[keyof Input],
  ): DPDATransition<
    State[keyof State],
    Input[keyof Input],
    Stack[keyof Stack]
  > {
    const stackTop = this.stack.pop();
    if (typeof stackTop === "undefined") {
      throw new Error(
        `State stack is empty on transition from currentState: ${this.state.toString()} with inputSymbol: ${inputSymbol.toString()}`,
      );
    }

    const transition = this.transitions
      .get(this.state)
      ?.get(inputSymbol)
      ?.get(stackTop);
    if (!transition) {
      this.stack.push(stackTop);
      throw new Error(
        `No transition for currentState: ${this.state.toString()}, inputSymbol: ${inputSymbol.toString()}, stackTop: ${stackTop.toString()}`,
      );
    }

    this._state = transition.nextState;
    this.stack.push(...transition.stackPush);

    return transition;
  }
}
