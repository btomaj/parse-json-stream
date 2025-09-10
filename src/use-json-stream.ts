import { useCallback, useEffect, useRef } from "react";
import { type JSONChunk, parseStream } from "~/index";

/**
 * When catching errors, use either through try...catch blocks with await, or
 * Promise.catch()
 *
 * @param bufferProcessor
 * @returns
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
            bufferProcessor(chunkBufferRef.current);
            chunkBufferRef.current = [];
          },
        );
      }
    },
    [bufferProcessor],
  );

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
          signal: fetchController.signal,
          ...options,
        });
        if (!response.ok || !response.body) {
          throw new Error(
            `Fetch failed from ${url}: HTTP ${response.status} ${response.statusText}`,
          );
        }

        const json = parseStream(response.body);
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
    };
  }, []);

  return { fetchJSONStream };
}
