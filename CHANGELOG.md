# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.2] - 2025-09-10

### Added
- Can use AbortSignal to terminate `parseStream` and `useJSONStream`
- CI and CD through GitHub Actions

### Features
- `useJSONStream` React hook for easy integration with React applications.
- New export path `/react` for the React hook.

## [3.0.0] - 2025-08-22

### Changes
- Bumped version to 3.0.0 as first release to pass unpublished versions

## [1.0.0] - 2025-08-22

### Added
- Initial release of parse-json-stream

### Features
- Comprehensive test suite with 5,455+ tests
- Zero dependencies
- Real-time parsing
- Support for ReadableStream, WebSocket, EventSource, and AsyncIterable
- Path tracking using JSONPath and JSON pointer
