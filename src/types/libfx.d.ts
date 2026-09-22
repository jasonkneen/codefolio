declare module "libfx/node" {
  export type FxTurnEvent = { type: "text_delta"; delta: string } | { type: string; [key: string]: unknown };
  export type FxTurn = AsyncIterable<FxTurnEvent> & { result: Promise<{ stopReason: string }>; cancel(): void };
  export type FxAgent = { prompt(input: string, options?: { signal?: AbortSignal }): FxTurn; close(): Promise<void> };
  export function createFxAgent(options: { apiKey: string; model?: string; gatewayChatUrl?: string; instructions?: string; tools?: unknown[]; backend?: "auto" | "native" | "wasm" }): Promise<FxAgent>;
}
