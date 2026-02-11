/**
 * POST /api/fetch-program
 *
 * Proxies external URL fetches to bypass CORS restrictions.
 * Returns the fetched binary data with a detected format header.
 */

import { NextRequest, NextResponse } from "next/server";
import { detectFormat } from "@/lib/program-parser";

const MAX_SIZE = 512 * 1024; // 512KB
const TIMEOUT_MS = 10_000;

/** Check if a hostname resolves to a private/internal address. */
function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Block localhost variants
  if (lower === "localhost" || lower === "localhost.localdomain") return true;

  // Block IPv6 loopback
  if (lower === "::1" || lower === "[::1]") return true;

  // Block private IPv4 ranges
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 127) return true;                     // 127.0.0.0/8
    if (a === 10) return true;                      // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;        // 192.168.0.0/16
    if (a === 169 && b === 254) return true;        // 169.254.0.0/16
    if (a === 0) return true;                       // 0.0.0.0/8
  }

  return false;
}

export async function POST(request: NextRequest) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ message: "Missing 'url' field" }, { status: 400 });
  }

  // Validate URL scheme
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ message: "Invalid URL" }, { status: 400 });
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json(
      { message: "Only http and https URLs are supported" },
      { status: 400 }
    );
  }

  // Block private/internal hosts
  if (isPrivateHost(parsedUrl.hostname)) {
    return NextResponse.json(
      { message: "Cannot fetch from private/internal addresses" },
      { status: 400 }
    );
  }

  // Fetch with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MicrocomputerEmulator/1.0" },
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { message: `Remote server returned ${response.status}: ${response.statusText}` },
        { status: 502 }
      );
    }

    // Check content length if available
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_SIZE) {
      return NextResponse.json(
        { message: `File too large (${contentLength} bytes, max ${MAX_SIZE})` },
        { status: 413 }
      );
    }

    // Read response body with size enforcement
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ message: "No response body" }, { status: 502 });
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > MAX_SIZE) {
        reader.cancel();
        return NextResponse.json(
          { message: `File too large (exceeded ${MAX_SIZE} bytes)` },
          { status: 413 }
        );
      }
      chunks.push(value);
    }

    // Combine chunks
    const data = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }

    // Detect format
    const detectedFormat = detectFormat(data);

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Detected-Format": detectedFormat,
        "X-Content-Length": totalSize.toString(),
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        { message: `Request timed out after ${TIMEOUT_MS / 1000}s` },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { message: `Fetch failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 }
    );
  }
}
