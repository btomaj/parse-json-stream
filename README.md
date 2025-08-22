# parse-json-stream

[![npm version](https://badge.fury.io/js/parse-json-stream.svg)](https://badge.fury.io/js/parse-json-stream)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

High-performance, real-time, JSON stream parser that parses and yields partial values as they arrive from a stream (before the complete value has been streamed). This library was built to parse structured JSON returned from LLMs, and display the values to users immediately as they arrive.

## ✨ Key Features

- **🚀 Real-time parsing** - Values are yielded as soon as they arrive from the stream
- **🌊 Strong browser support** - Works with ReadableStream, WebSocket, EventSource, and AsyncIterable
- **📍 Path tracking** - Every value includes its JSONPath and JSON pointer location
- **⚡ Lightweight and fast** - Optimised to minimise CPU cycles and memory allocation. Zero dependencies.

## Installation

```bash
npm install parse-json-stream
```

## Quick Start

```typescript
import { parseStream } from 'parse-json-stream';

// Create a stream of JSON chunks
const stream: ReadableStream | WebSocket | EventSource | AsyncIterable = ...;

// Parse and process values as they arrive
for await (const chunk of parseStream(stream)) {
  console.log(chunk.value);   // "Alice"
  console.log(chunk.segment); // ["users", 0, "name"]
  console.log(chunk.path);    // "$.users[0].name"
  console.log(chunk.pointer); // "/users/0/name"
  console.log(chunk.type);    // "string"
}
```

alternatively, you can patch the global JSON object:

```typescript
import 'parse-json-stream/patch';

// Now available globally
for await (const chunk of JSON.parseStream(stream)) {
  console.log(chunk.value);
}
```


## Why This Library?

Existing libraries wait for each JSON value to stream to completion before parsing and returning it, resulting in a poor UX with the dreaded waiting wheel.

| Existing libraries | parse-json-stream |
|---------------------|------------------|
| ⏳ Waits for complete value | ✅ Parses incomplete values as they arrive from the stream |
| 🐌 Blocks until entire value is received | ⚡ Immediately show partial responses to users |
| 😴 Keeps users waiting | 🎯 Progressive parsing |

When requesting structured JSON from an LLM, existing parsers keep the user waiting for the complete value to stream. With `parse-json-stream`, you can show the LLM JSON response values to users in real-time as they're streamed to the client.

## API Reference

### `parseStream(stream)`

Parses a JSON stream and yields `JSONChunk` objects as values are parsed.

**Parameters:**
- `stream`: `ReadableStream | EventSource | WebSocket | AsyncIterable<string | Uint8Array | ArrayBuffer>`

**Returns:** `AsyncGenerator<JSONChunk>`

### JSONChunk

**Note:** `value` is always returned as a string. Parse numbers/booleans/nulls as needed after the value has been streamed to completion. Values have been streamed to completion a chunk of the next value is yielded, and when the stream is completed. Use the chunk type to determine how to parse, for example:
```typescript
if (chunk.type === 'number') {
  const numValue = parseFloat(chunk.value);
}
if (chunk.type === 'boolean') {
  const boolValue = chunk.type === 'true';
}
if (chunk.type === 'null') { ... }
```

Each chunk represents a parsed JSON primitive value with its location:

```typescript
interface JSONChunk {
  value: string;              // The parsed value (always a string)
  type: JSONValue;           // "string" | "number" | "true" | "false" | "null"
  path: string;              // JavaScript-style path: "$.users[0].name"
  pointer: string;           // JSON Pointer: "/users/0/name"
  segments: Array<string|number>; // Path segments: ["users", 0, "name"]
}
```

## Stream Sources

Works seamlessly with multiple stream types:

### ReadableStream
```typescript
const response = await fetch('/api/data');
for await (const chunk of parseStream(response.body)) {
  console.log(chunk.value);
}
```

### WebSocket
```typescript
const ws = new WebSocket('wss://api.example.com/stream');
for await (const chunk of parseStream(ws)) {
  console.log(chunk.value);
}
```

### EventSource (Server-Sent Events)
```typescript
const events = new EventSource('/api/sse');
for await (const chunk of parseStream(events)) {
  console.log(chunk.value);
}
```

### AsyncIterable
```typescript
const asyncIterable = ...; // AsyncIterable provided from a source

for await (const chunk of parseStream(asyncIterable)) {
  console.log(chunk.value);
}
```

## Real-World Examples

### LLM Streaming Response
```typescript
async function streamLLMResponse(prompt: string) {
  const response = await fetch('/api/llm/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });

  for await (const chunk of parseStream(response.body)) {
    if (chunk.path === '$.content') {
      // Display content as it arrives
      appendToChat(chunk.value);
    } else if (chunk.path === '$.metadata.tokens_used') {
      // Update token counter
      updateTokenCount(parseInt(chunk.value));
    }
  }
}
```

### Real-time Dashboard
```typescript
async function connectToDashboard() {
  const ws = new WebSocket('wss://dashboard.example.com/metrics');

  for await (const chunk of parseStream(ws)) {
    if (chunk.path.match(/^\$\.metrics\[\d+\]\.value$/)) {
      const metricIndex = chunk.segments[1] as number;
      updateMetric(metricIndex, parseFloat(chunk.value));
    } else if (chunk.path === '$.timestamp') {
      updateLastRefresh(new Date(chunk.value));
    }
  }
}
```

## Advanced Usage

### Error Handling
```typescript
try {
  for await (const chunk of parseStream(stream)) {
    processChunk(chunk);
  }
} catch (error) {
  console.error('JSON parsing error:', error);
}
```

### Path Filtering
```typescript
// Only process specific paths
for await (const chunk of parseStream(stream)) {
  if (chunk.path.startsWith('$.users[') && chunk.path.endsWith('.email')) {
    validateEmail(chunk.value);
  }
}
```

## Contributing

The library is under active development, and contributions are warmly welcomed!

TODO
- [ ] Clean up redundant JSONTransitions
- [ ] Buffer incomplete non-string primitives between chunks in JSONLexer.tokenise()
- [ ] Look for opportunities to move reusable logic from JSONLexer to abstract Lexer
- [ ] Deduplicate calls to DPDA.transition() in JSONParser and FSM.transition() JSONLexer, and refactor into 3D array.

## License

[ISC](LICENSE) © 2024
