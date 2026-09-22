import type { NotebookVideo } from "./videos";
import type { NotebookImage } from "./images";
import type { Edge, Node } from "@xyflow/react";

export type CellKind = "markdown" | "code" | "image" | "artifact" | "video";

export type Display =
  | { kind: "text"; text: string }
  | { kind: "html"; html: string }
  | { kind: "image"; src: string; alt?: string }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "json"; json: string }
  | { kind: "error"; message: string; stack?: string };

export type LogLine = {
  level: "log" | "info" | "warn" | "error";
  text: string;
};

export type CellOutput = {
  logs: LogLine[];
  displays: Display[];
};

export type CellReference = { nodeId: string; cellId: string; path?: string[] };
export type ArtifactInput = { name: string; reference: CellReference };

export type Cell = {
  name?: string;
  references?: Record<string, CellReference>;
  inputs?: ArtifactInput[];
  stale?: boolean;
  id: string;
  kind: CellKind;
  source: string;
  image?: NotebookImage;
  video?: NotebookVideo;
  artifactNetwork?: boolean;
  codeTheme?: "light" | "dark";
  previewTheme?: "light" | "dark";
  output: CellOutput | null;
  status: "idle" | "running" | "ok" | "error";
};

export type NotebookData = {
  title: string;
  /** Handle other cards import, without the @. */
  ref: string;
  /** Repo-relative source identity. This is separate from the editable card handle. */
  sourcePath?: string;
  cells: Cell[];
};

export type FolioNode = Node<NotebookData, "notebook">;
export type FolioEdge = Edge;
