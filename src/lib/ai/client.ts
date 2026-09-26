import { assistantEventSchema, type AssistantEvent, type AssistantRequest } from "./protocol";

export function serviceUrl(path: string): string {
  return `${(import.meta.env?.VITE_CODEFOLIO_SERVICE_URL ?? "").replace(/\/$/, "")}${path}`;
}
export async function* readAssistantStream(body: ReadableStream<Uint8Array>): AsyncGenerator<AssistantEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (buffer.length > 200_000) throw Error("Assistant response exceeded the stream limit.");
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
        if (!line) continue;
        const event = assistantEventSchema.parse(JSON.parse(line));
        if (event.type === "error") throw Error(event.message);
        if (event.type === "done") completed = true;
        yield event;
      }
      if (chunk.done) break;
    }
    if (!completed || buffer.trim()) throw Error("Assistant connection ended before the response finished.");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function requestAssistant(request: AssistantRequest, token: string, signal: AbortSignal, onEvent: (event: AssistantEvent) => void) {
  const response = await fetch(serviceUrl("/api/assistant"), {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(request),
  });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw Error(error.error ?? `Assistant service returned ${response.status}.`); }
  if (!response.body) throw Error("Assistant returned no response stream.");
  for await (const event of readAssistantStream(response.body)) onEvent(event);
}
