/**
 * Client-side program fetcher.
 *
 * Fetches program binaries directly from the provided URL.
 * Format detection runs entirely in the browser.
 *
 * Note: Some URLs may fail due to CORS restrictions. Sites that serve
 * files with permissive CORS headers (or same-origin) will work.
 */

import type { ProgramFileFormat } from "@/emulator/apple1/software-library";
import { detectFormat } from "@/lib/program-parser";

export interface FetchProgramResult {
  data: Uint8Array;
  detectedFormat: ProgramFileFormat;
}

const MAX_SIZE = 512 * 1024; // 512KB
const TIMEOUT_MS = 10_000;

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

  // Fetch with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(
        `Remote server returned ${response.status}: ${response.statusText}`
      );
    }

    // Check content length if available
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

    const data = new Uint8Array(buffer);
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
