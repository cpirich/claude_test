/**
 * Client-side wrapper for fetching programs via the proxy API route.
 */

import type { ProgramFileFormat } from "@/emulator/apple1/software-library";

export interface FetchProgramResult {
  data: Uint8Array;
  detectedFormat: ProgramFileFormat;
}

export async function fetchProgram(url: string): Promise<FetchProgramResult> {
  const response = await fetch("/api/fetch-program", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    let message = `Fetch failed (${response.status})`;
    try {
      const error = await response.json();
      if (error.message) message = error.message;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(message);
  }

  const buffer = await response.arrayBuffer();
  const detectedFormat =
    (response.headers.get("X-Detected-Format") as ProgramFileFormat) ?? "binary";

  return { data: new Uint8Array(buffer), detectedFormat };
}
