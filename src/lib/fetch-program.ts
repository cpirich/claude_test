/**
 * Client-side program fetcher.
 *
 * Fetches program binaries directly from the provided URL.
 * Falls back to a CORS proxy if the direct fetch fails due to CORS.
 * Format detection runs entirely in the browser.
 */

import type { ProgramFileFormat } from "@/emulator/apple1/software-library";
import { detectFormat } from "@/lib/program-parser";

export interface FetchProgramResult {
  data: Uint8Array;
  detectedFormat: ProgramFileFormat;
}

const MAX_SIZE = 512 * 1024; // 512KB
const TIMEOUT_MS = 10_000;
const CORS_PROXIES = [
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

async function fetchWithTimeout(
  url: string,
  signal: AbortSignal
): Promise<Response> {
  const response = await fetch(url, { signal, redirect: "follow" });
  if (!response.ok) {
    throw new Error(
      `Remote server returned ${response.status}: ${response.statusText}`
    );
  }
  return response;
}

async function readResponse(response: Response): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_SIZE) {
    throw new Error(
      `File too large (${contentLength} bytes, max ${MAX_SIZE})`
    );
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_SIZE) {
    throw new Error(
      `File too large (${buffer.byteLength} bytes, max ${MAX_SIZE})`
    );
  }

  return new Uint8Array(buffer);
}

function isCorsError(error: unknown): boolean {
  // Browser CORS failures surface as generic TypeErrors with "Failed to fetch"
  return error instanceof TypeError && /failed to fetch/i.test(error.message);
}

export async function fetchProgram(url: string): Promise<FetchProgramResult> {
  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let data: Uint8Array | undefined;

    try {
      // Try direct fetch first
      const response = await fetchWithTimeout(url, controller.signal);
      data = await readResponse(response);
    } catch (directError) {
      if (!isCorsError(directError)) throw directError;

      // CORS failure — try proxies in order
      let lastProxyError: unknown = directError;
      for (const makeUrl of CORS_PROXIES) {
        try {
          const response = await fetchWithTimeout(makeUrl(url), controller.signal);
          data = await readResponse(response);
          break;
        } catch (proxyError) {
          lastProxyError = proxyError;
        }
      }
      if (!data) throw lastProxyError;
    }

    clearTimeout(timeoutId);
    const detectedFormat = detectFormat(data);
    return { data, detectedFormat };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw error;
  }
}
