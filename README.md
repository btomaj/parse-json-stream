# parse-json-stream

## Todo
- [ ] Buffer incomplete non-string primitives between chunks in JSONLexer.tokenise()
- [ ] Look for opportunities to move reusable logic from JSONLexer to abstract Lexer
- [ ] Deduplicate calls to DPDA.transition() in JSONParser and FSM.transition() JSONLexer, and refactor into 3D array.
