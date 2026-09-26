import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASSISTANT_INSTRUCTIONS, assistantPrompt, type AssistantRequest } from "../src/lib/ai/protocol.js";

export type EmitText = (delta: string) => void;

/** SSE records may span any number of network reads. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let data: string[] = [];
  try {
    while (true) {
      const chunk = await reader.read(); buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (buffer.length > 1_000_000) throw Error("Provider stream record exceeded its size limit.");
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, ""); buffer = buffer.slice(end + 1);
        if (!line) { if (data.length) { yield data.join("\n"); data = []; } }
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (chunk.done) break;
    }
    if (buffer.startsWith("data:")) data.push(buffer.slice(5).trim());
    if (data.length) yield data.join("\n");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function runEndpoint(request: AssistantRequest, signal: AbortSignal, emit: EmitText) {
  const gateway = request.provider === "gateway";
  const endpoint = gateway ? "https://ai-gateway.vercel.sh/v1/chat/completions" : request.endpoint;
  if (!endpoint) throw Error("Enter a custom endpoint URL.");
  const url = new URL(endpoint);
  if (url.username || url.password || url.hash || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw Error("Use HTTPS, or HTTP on localhost, for custom endpoints.");
  const key = request.apiKey || (gateway ? process.env.AI_GATEWAY_API_KEY : process.env.CODEFOLIO_CUSTOM_API_KEY);
  if (gateway && !key) throw Error("Set AI_GATEWAY_API_KEY on the service, or enter a Gateway key.");
  if (!request.model) throw Error("Enter the model identifier supplied by your provider.");
  const response = await fetch(url, {
    method: "POST", signal, headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model: request.model, stream: true, messages: [{ role: "system", content: ASSISTANT_INSTRUCTIONS }, { role: "user", content: assistantPrompt(request) }] }),
  });
  if (!response.ok) throw Error(`AI provider returned HTTP ${response.status}. Check its endpoint, model and credentials.`);
  if (!response.body) throw Error("AI provider returned no stream.");
  let finished = false; let text = false;
  for await (const data of sseData(response.body)) {
    if (data === "[DONE]") break;
    const chunk = JSON.parse(data) as { error?: { message?: string }; choices?: { delta?: { content?: string }; finish_reason?: string | null }[] };
    if (chunk.error) throw Error(chunk.error.message || "Provider returned an error.");
    const choice = chunk.choices?.[0];
    if (typeof choice?.delta?.content === "string" && choice.delta.content) { emit(choice.delta.content); text = true; }
    if (choice?.finish_reason) {
      if (choice.finish_reason !== "stop") throw Error(`Provider stopped with ${choice.finish_reason}. The response is incomplete.`);
      finished = true;
    }
  }
  if (!finished || !text) throw Error("AI provider connection ended before a complete response.");
}

export async function runClaude(request: AssistantRequest, signal: AbortSignal, emit: EmitText, queryFactory?: typeof import("@anthropic-ai/claude-agent-sdk")["query"]) {
  const query = queryFactory ?? (await import("@anthropic-ai/claude-agent-sdk")).query;
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
  const cwd = await mkdtemp(join(tmpdir(), "codefolio-assistant-"));
  let text = false; let finished = false;
  const session = query({ prompt: assistantPrompt(request), options: {
    cwd, systemPrompt: ASSISTANT_INSTRUCTIONS, tools: [], mcpServers: {}, settingSources: [],
    persistSession: false, includePartialMessages: true, maxTurns: 1,
    abortController: controller, ...(request.model ? { model: request.model } : {}),
  } });
  try {
    for await (const message of session) {
      if (message.type === "stream_event" && message.event.type === "content_block_delta" && message.event.delta.type === "text_delta") { emit(message.event.delta.text); text = true; }
      if (message.type === "assistant" && !text) {
        for (const part of message.message.content) if (part.type === "text") { emit(part.text); text = true; }
      }
      if (message.type === "result") {
        if (message.subtype !== "success" || message.is_error) throw Error("Claude did not complete this request. Check the service's Claude login or API key.");
        finished = true;
      }
    }
    if (!finished || !text) throw Error("Claude connection ended before a complete response.");
  } finally { signal.removeEventListener("abort", abort); session.close(); await rm(cwd, { recursive: true, force: true }); }
}

type RpcFrame = { id?: number; method?: string; params?: any; result?: any; error?: { message: string } };
export async function runCodex(request: AssistantRequest, signal: AbortSignal, emit: EmitText, command = process.env.CODEFOLIO_CODEX_COMMAND || "codex", args = ["app-server", "--listen", "stdio://"]) {
  const cwd = await mkdtemp(join(tmpdir(), "codefolio-assistant-"));
  const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
  let sequence = 0; let buffer = ""; let ended = false;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let settle: ((error?: Error) => void) | undefined;
  let completed = false; let failure: Error | undefined; let threadId: string | undefined; let turnId: string | undefined;
  let emitted = false;
  const finish = (error?: Error) => { completed = true; failure = error; settle?.(error); };
  const send = (frame: RpcFrame) => { if (!ended) child.stdin.write(`${JSON.stringify(frame)}\n`); };
  const rpc = (method: string, params: unknown): Promise<any> => new Promise((resolve, reject) => {
    if (ended || signal.aborted) { reject(Error("Codex process is unavailable.")); return; }
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`Codex ${method} timed out.`)); }, 30_000);
    pending.set(id, { resolve, reject, timer }); send({ id, method, params });
  });
  const stop = () => {
    finish(Error("Assistant request cancelled."));
    if (threadId && turnId) send({ id: ++sequence, method: "turn/interrupt", params: { threadId, turnId } });
    child.kill("SIGTERM");
  };
  signal.addEventListener("abort", stop, { once: true });
  child.stderr.on("data", () => {}); // Drain without printing user context or credentials.
  const failProcess = (error: Error) => {
    ended = true;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear(); if (!completed) finish(error);
  };
  child.on("error", error => failProcess(error));
  child.on("exit", () => failProcess(Error("Codex process exited before completing its response.")));
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    if (buffer.length > 2_000_000) { failProcess(Error("Codex response exceeded its size limit.")); child.kill(); return; }
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      try {
        const frame = JSON.parse(line) as RpcFrame;
        if (frame.id !== undefined && !frame.method) {
          const item = pending.get(frame.id); if (!item) continue;
          pending.delete(frame.id); clearTimeout(item.timer);
          if (frame.error) item.reject(Error(frame.error.message)); else item.resolve(frame.result);
        } else if (frame.id !== undefined && frame.method) {
          // This notebook assistant is text-only; it cannot approve process/file operations.
          send({ id: frame.id, result: frame.method.includes("requestApproval") ? { decision: "decline" } : { error: "This assistant has no external tools." } });
        } else if (frame.method === "item/agentMessage/delta") { emit(frame.params.delta); emitted = true; }
        else if (frame.method === "item/completed" && frame.params.item?.type === "agentMessage" && !emitted) { emit(frame.params.item.text); emitted = true; }
        else if (frame.method === "turn/completed") {
          const turn = frame.params.turn;
          finish(turn.status === "completed" && emitted ? undefined : Error(turn.error?.message || `Codex turn ${turn.status}.`));
        }
      } catch (error) { failProcess(error instanceof Error ? error : Error("Invalid Codex response.")); child.kill(); }
    }
  });
  try {
    if (signal.aborted) { stop(); throw Error("Assistant request cancelled."); }
    await rpc("initialize", { clientInfo: { name: "codefolio", version: "0.1.0" }, capabilities: {} }); send({ method: "initialized", params: {} });
    const result = await rpc("thread/start", { cwd, ephemeral: true, sandbox: "read-only", approvalPolicy: "never", config: { "features.shell_tool": false, "features.apply_patch_freeform": false, "features.multi_agent": false, "features.apps": false, web_search: "disabled" }, baseInstructions: ASSISTANT_INSTRUCTIONS, ...(request.model ? { model: request.model } : {}) });
    threadId = result.thread.id;
    const turn = await rpc("turn/start", { threadId, input: [{ type: "text", text: assistantPrompt(request), text_elements: [] }] });
    turnId = turn.turn.id;
    if (completed) { if (failure) throw failure; }
    else await new Promise<void>((resolve, reject) => { settle = error => error ? reject(error) : resolve(); });
  } finally {
    signal.removeEventListener("abort", stop); settle = undefined;
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error("Codex session closed.")); }
    pending.clear();
    child.kill("SIGTERM");
    const killTimer = setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    if (child.exitCode === null && child.signalCode === null) await new Promise<void>(resolve => child.once("exit", () => resolve()));
    clearTimeout(killTimer); await rm(cwd, { recursive: true, force: true });
  }
}
export async function runProvider(request: AssistantRequest, signal: AbortSignal, emit: EmitText) {
  if (request.provider === "claude") return runClaude(request, signal, emit);
  if (request.provider === "codex") return runCodex(request, signal, emit);
  return runEndpoint(request, signal, emit);
}
