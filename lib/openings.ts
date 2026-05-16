// Helpers for rendering opening metadata consistently across surfaces.

import type { TrackKind } from "./types";

// Formats an opening's "OP1" / "ED2" prefix from kind + sequence_number.
//
//   formatSequenceLabel("opening", 1) === "OP1"
//   formatSequenceLabel("ending",  2) === "ED2"
//   formatSequenceLabel("ost",     null) === ""
//
// OSTs deliberately have no sequence number (and the API enforces NULL),
// so the prefix is suppressed. Same for the defensive null-on-non-OST
// case: if the row predates the migration backfill the UI just shows
// the title with no prefix rather than rendering "OP" / "ED" with a
// missing number.
export function formatSequenceLabel(kind: TrackKind, sequenceNumber: number | null): string {
  if (sequenceNumber == null) return "";
  if (kind === "opening") return `OP${sequenceNumber}`;
  if (kind === "ending") return `ED${sequenceNumber}`;
  return "";
}
