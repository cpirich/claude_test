/**
 * Apple I Remote Software Catalog
 *
 * Programs that are fetched on demand from known URLs.
 * All URLs point to freely available, openly licensed sources.
 */

import type { SoftwareEntry } from "./software-library";

export const APPLE1_REMOTE_CATALOG: SoftwareEntry[] = [
  {
    id: "integer-basic-full",
    name: "INTEGER BASIC (FULL ROM)",
    description:
      "4KB Apple Integer BASIC interpreter by Steve Wozniak. Provides a full BASIC programming environment.",
    category: "language",
    regions: [],
    entryPoint: 0xe000,
    author: "Steve Wozniak",
    year: 1976,
    sizeBytes: 4096,
    addressRange: "$E000-$EFFF",
    isStub: false,
    url: "https://raw.githubusercontent.com/jscrane/Apple1/master/images/basic.rom",
    format: "binary",
    defaultLoadAddress: 0xe000,
    machine: "apple1",
    notes: "Downloads the Integer BASIC ROM from the jscrane/Apple1 project (MIT license).",
    loadInstructions: "Starts automatically. Type BASIC commands at the > prompt. Try: 10 PRINT \"HELLO\" then RUN. Type CTRL+C to return to monitor.",
  },
];
