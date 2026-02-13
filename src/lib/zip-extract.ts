/**
 * ZIP file extraction utilities using JSZip.
 * Used by the software library modal for loading programs from zip archives.
 */

import JSZip from "jszip";

export interface ZipFileEntry {
  name: string;
  path: string;
  sizeBytes: number;
  isDirectory: boolean;
}

/**
 * Check if data looks like a ZIP file (PK magic bytes).
 */
export function isZipData(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
}

/**
 * Check if a URL or filename has a .zip extension.
 */
export function isZipFilename(name: string): boolean {
  return /\.zip$/i.test(name);
}

/**
 * List files inside a zip archive.
 * Returns non-directory entries sorted by name.
 */
export async function listZipFiles(data: Uint8Array): Promise<ZipFileEntry[]> {
  const zip = await JSZip.loadAsync(data);
  const entries: ZipFileEntry[] = [];

  zip.forEach((path, file) => {
    if (!file.dir) {
      entries.push({
        name: path.split("/").pop() ?? path,
        path,
        sizeBytes: 0, // Will be filled after reading
        isDirectory: false,
      });
    }
  });

  // Get actual sizes by reading each file
  for (const entry of entries) {
    const file = zip.file(entry.path);
    if (file) {
      const content = await file.async("uint8array");
      entry.sizeBytes = content.length;
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Extract a single file from a zip archive by path.
 */
export async function extractZipFile(
  data: Uint8Array,
  filePath: string
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(data);
  const file = zip.file(filePath);
  if (!file) {
    throw new Error(`File not found in archive: ${filePath}`);
  }
  return file.async("uint8array");
}
