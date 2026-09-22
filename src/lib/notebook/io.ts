import { isVideoSource } from "./videos";
import { normalizeCells, validCellName } from "./cell-references";
import { isPersistentImageSource } from "./images";
import { z } from "zod";
import { outputSchema } from "./output-safety";
import type { FolioEdge, FolioNode } from "./types";
import { assignRefs } from "./refs";
import { uid } from "@/lib/utils";

export const FOLIO_EXPORT_VERSION = 4;

export type FolioDeskFile = {
  folio: number;
  name?: string;
  exportedAt?: string;
  nodes: FolioNode[];
  edges: FolioEdge[];
};

const id = z.string().min(1).max(200);
const dimension = z.number().finite().min(100).max(4000);
const referenceSchema = z.object({ nodeId: id, cellId: id, path: z.array(z.string().max(80)).max(10).optional() });
const cellSchema = z.object({
  id: id.optional(),
  name: z.string().refine(validCellName).optional(),
  references: z.record(z.string().max(200), referenceSchema).optional(),
  inputs: z.array(z.object({ name: z.string().max(80), reference: referenceSchema })).max(50).optional(),
  stale: z.boolean().optional(),
  kind: z.enum(["markdown", "code", "image", "artifact", "video"]),
  artifactNetwork: z.boolean().optional(),
  codeTheme: z.enum(["light", "dark"]).optional(),
  previewTheme: z.enum(["light", "dark"]).optional(),
  source: z.string().max(200_000),
  image: z.object({
    src: z.string().max(1_500_000).refine(isPersistentImageSource),
    alt: z.string().max(2000), caption: z.string().max(2000),
    width: z.number().int().positive().max(40000).optional(),
    height: z.number().int().positive().max(40000).optional(),
  }).optional(),
  video: z.object({ src: z.string().max(17_000_000).refine(isVideoSource), name: z.string().max(500), caption: z.string().max(2000) }).optional(),
  output: outputSchema.nullable().optional(),
  status: z.enum(["idle", "running", "ok", "error"]).optional(),
});
const nodeSchema = z.object({
  id: id.optional(),
  position: z.object({ x: z.number().finite().min(-1e6).max(1e6), y: z.number().finite().min(-1e6).max(1e6) }).optional(),
  // Deliberately strip every CSS property except bounded dimensions.
  style: z.object({ width: dimension.optional(), height: dimension.optional() }).optional(),
  width: dimension.optional(), height: dimension.optional(),
  data: z.object({
    title: z.string().max(500).optional(),
    ref: z.string().max(200).optional(),
    sourcePath: z.string().min(1).max(500).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_./ -]+\.(?:[cm]?[jt]sx?)$/).optional(),
    cells: z.array(cellSchema).min(1).max(500),
  }),
});
const deskSchema = z.object({
  folio: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(FOLIO_EXPORT_VERSION)]).optional(), // pre-export local saves lack a version
  nodes: z.array(nodeSchema).max(200),
  edges: z.array(z.object({
    id: id.optional(), source: id, target: id,
    sourceHandle: z.string().max(200).nullable().optional(),
    targetHandle: z.string().max(200).nullable().optional(),
  })).max(2000).optional(),
});

export function serializeDesk(nodes: FolioNode[], edges: FolioEdge[]): FolioDeskFile {
  return {
    folio: FOLIO_EXPORT_VERSION,
    name: "Codefolio desk",
    exportedAt: new Date().toISOString(),
    nodes: nodes.map(exportNode),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
  };
}

export function parseFolioExport(data: unknown): { nodes: FolioNode[]; edges: FolioEdge[] } | null {
  const result = deskSchema.safeParse(data);
  if (!result.success) return null;
  const nodes: FolioNode[] = result.data.nodes.map((raw) => ({
    id: raw.id ?? uid("nb"), type: "notebook", dragHandle: ".notebook-drag-handle",
    position: raw.position ?? { x: 72, y: 96 },
    style: { width: raw.style?.width ?? raw.width ?? 520, height: raw.style?.height ?? raw.height ?? 560 },
    data: {
      title: raw.data.title ?? "Untitled notebook", ref: raw.data.ref ?? "", sourcePath: raw.data.sourcePath,
      cells: raw.data.cells.map((cell) => ({
        id: cell.id ?? uid("cell"), name: cell.name, references: cell.references, inputs: cell.inputs, stale: cell.stale, kind: cell.kind, source: cell.source, image: cell.image, video: cell.video, artifactNetwork: cell.artifactNetwork, codeTheme: cell.codeTheme, previewTheme: cell.previewTheme,
        output: cell.output ?? null,
        status: cell.status === "ok" || cell.status === "error" ? cell.status : "idle",
      })),
    },
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) return null;
  if (nodes.some((node) => new Set(node.data.cells.map((cell) => cell.id)).size !== node.data.cells.length)) return null;
  const edges: FolioEdge[] = (result.data.edges ?? []).map((edge) => ({
    id: edge.id ?? uid("edge"), source: edge.source, target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined, targetHandle: edge.targetHandle ?? undefined,
  }));
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length) return null;
  if (edges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) return null;
  return { nodes: normalizeCells(assignRefs(nodes)), edges };
}

export function downloadDesk(file: FolioDeskFile) {
  const stamp = (file.exportedAt ?? new Date().toISOString()).slice(0, 10);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `codefolio-desk-${stamp}.json`;
  a.rel = "noopener";
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function exportNode(node: FolioNode): FolioNode {
  return {
    id: node.id,
    type: "notebook",
    dragHandle: ".notebook-drag-handle",
    position: node.position,
    style: node.style,
    width: node.width,
    height: node.height,
    data: {
      title: node.data.title,
      ref: node.data.ref,
      sourcePath: node.data.sourcePath,
      cells: node.data.cells.map((cell) => ({
        id: cell.id,
        name: cell.name, references: cell.references, inputs: cell.inputs, stale: cell.stale,
        kind: cell.kind,
        source: cell.source,
        artifactNetwork: cell.artifactNetwork, codeTheme: cell.codeTheme, previewTheme: cell.previewTheme,
        image: cell.image, video: cell.video,
        output: cell.output,
        status: cell.status === "running" ? "idle" : cell.status,
      })),
    },
  };
}
