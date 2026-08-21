// Shared contract between the HUD and whichever centerpiece is mounted.
// Kept in its own module so the type import doesn't drag a core's WebGL
// payload into the server bundle.

export type CoreMode = "idle" | "working" | "listening" | "speaking" | "error";
export type BgMode = "flat" | "depth" | "grid" | "nebula";
export const BG_MODES: BgMode[] = ["flat", "depth", "grid", "nebula"];

export interface CoreProps {
  mode?: CoreMode;
  bgMode?: BgMode;
  /** real speech envelope 0..1, or null when no audio is playing */
  getLevel?: () => number | null;
}
