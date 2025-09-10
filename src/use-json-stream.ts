import { useCallback, useEffect, useRef } from "react";
import { type JSONChunk, parseStream } from "~/index";

/**
 * React hook for fetching and parsing a JSON stream.
 *
 * The hook automatically handles request cancellation, optimises performance by
 * batching chunks using animation frames, and provides automatic cleanup on
 * component unmount.
 *
 * @example
 * ```typescript
 * const { fetchJSONStream } = useJSONStream((chunks) => {
 *   for (const chunk of chunks) {
 *     setData(data => data + chunk.value);
 *   }
 * });
 *
 * useEffect(() => {
 *   fetchJSONStream('/api/json-stream');
 * }, [fetchJSONStream]);
 * ```
 *
 * @param bufferProcessor Your function to process batches of JSONChunk objects on each animation frame
 * @returns Object containing fetchJSONStream function for initiating the fetch request
 */
export function useJSONStream(
  bufferProcessor: (jsonChunks: Array<JSONChunk>) => void,
) {
  const fetchControllerRef = useRef<AbortController | null>(null);
  const parseControllerRef = useRef<AbortController | null>(null);
  const chunkBufferRef = useRef<Array<JSONChunk>>([]);

  const scheduledAnimationFrameRef = useRef<number | null>(null);
  const scheduleBufferProcessor = useCallback(
    function scheduleBufferProcessor() {
      if (scheduledAnimationFrameRef.current === null) {
        scheduledAnimationFrameRef.current = requestAnimationFrame(
          function animationFrameCallback() {
            scheduledAnimationFrameRef.current = null;
            const chunks = chunkBufferRef.current;
            chunkBufferRef.current = []; // clear before bufferProcessor in case bufferProcessor throws
            bufferProcessor(chunks);
          },
        );
      }
    },
    [bufferProcessor],
  );

  /**
   * Fetches and streams JSON data from the specified URL.
   *
   * Automatically cancels any previous streaming requests before starting a new one.
   * JSON chunks are buffered and processed on animation frames for optimal performance.
   *
   * @example Basic usage
   * ```typescript
   * await fetchJSONStream('/api/data');
   * ````
   *
   * @example With custom options
   * ```typescript
   * await fetchJSONStream('/api/chat', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ message: 'Hello' })
   * });
   * ```

   * @param url The URL from which to fetch JSON data
   * @param [options] Standard fetch options, except 'signal'
   * @throws {Error} When the fetch request fails or response is invalid
   * @returns Promise that resolves when streaming is complete or rejects on error
   */
  const fetchJSONStream = useCallback(
    async function fetchJSONStream(url: string, options = {}): Promise<void> {
      // abort past fetch and parse, if any
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
      if (parseControllerRef.current) {
        parseControllerRef.current.abort();
      }

      const fetchController = new AbortController();
      fetchControllerRef.current = fetchController;
      const parseController = new AbortController();
      parseControllerRef.current = parseController;

      try {
        const response = await fetch(url, {
          ...options,
          signal: fetchController.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(
            `Fetch failed from ${url}: HTTP ${response.status} ${response.statusText}`,
          );
        }

        const json = parseStream(response.body, {
          signal: parseController.signal,
        });
        for await (const chunk of json) {
          if (parseController.signal.aborted) {
            break;
          }
          chunkBufferRef.current.push(chunk);
          scheduleBufferProcessor();
        }

        // schedule an animation frame, if one isn't scheduled already, to flush the chunk buffer
        if (chunkBufferRef.current.length > 0) {
          scheduleBufferProcessor();
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          throw error;
        }
      } finally {
        fetchControllerRef.current = null;
        parseControllerRef.current = null;
      }
    },
    [scheduleBufferProcessor],
  );

  useEffect(function setupUseJSONStreamCleanup() {
    return function cleanupUseJSONStream() {
      fetchControllerRef.current?.abort();
      parseControllerRef.current?.abort();
      if (scheduledAnimationFrameRef.current) {
        cancelAnimationFrame(scheduledAnimationFrameRef.current);
      }
      chunkBufferRef.current = [];
    };
  }, []);

  return { fetchJSONStream };
}
