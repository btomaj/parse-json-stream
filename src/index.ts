import {
  JSONCharacter,
  JSONParserUseCase,
  JSONTransitions,
  JSONValue,
} from "~/lib/application/parser";
import { Lexer } from "~/lib/domain/lexer";
import { DPDA, FSM } from "~/lib/domain/state";
import { StreamProcessorFactory } from "~/lib/domain/stream-adapter";

/**
 * TODO
 * - [ ] Emit error event for unexpected JSONTokenType, e.g. JSONTokenType.Comma when waiting for a value inside an JSONState.Object
 * - [ ] Replace template literal with nested map for transition lookup
 */

class JSONFSM extends FSM<
  typeof JSONValue & { Key: "key"; Value: "value"; Null: null },
  typeof JSONCharacter
> {}
class JSONDPDA extends DPDA<
  typeof JSONValue & { Key: "key"; Value: "value"; Null: null },
  typeof JSONCharacter
> {}

export class JSONLexer extends Lexer<
  typeof JSONValue & { Key: "key"; Value: "value"; Null: null },
  typeof JSONCharacter
> {
  private isEscaped = false;
  private buffer = "";

  public async *tokenise(chunk: string) {
    const tokens = this.yieldToken(chunk);
    for (const token of tokens) {
      switch (token.type) {
        case JSONCharacter.Escape:
          // biome-ignore  lint/suspicious/noFallthroughSwitchClause: DRY
          // this.buffer += token.lexeme;
          this.isEscaped = true;
        case JSONCharacter.Number:
        case JSONCharacter.True:
        case JSONCharacter.False:
        case JSONCharacter.Null:
          this.buffer += token.lexeme;
          continue;
      }

      if (this.buffer.length > 0) {
        token.lexeme = this.buffer + token.lexeme;
        this.buffer = "";
      }
      if (this.isEscaped) {
        this.isEscaped = false;
      }

      yield token;
    }
  }
}

export function parseStream(
  stream:
    | ReadableStream
    | EventSource
    | WebSocket
    | AsyncIterable<string | Uint8Array | ArrayBuffer>,
): void {
  const fsm = new JSONFSM(JSONTransitions, JSONValue.None);
  const lexer = new JSONLexer(JSONValue, JSONTransitions, fsm);
  const dpda = new JSONDPDA(JSONTransitions, JSONValue.None);
  const parser = new JSONParserUseCase(lexer, dpda);

  const processor = StreamProcessorFactory.create(stream);
  throw new Error("parseStream not yet implemented");
}
