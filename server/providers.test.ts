import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runClaude, runCodex, runEndpoint } from "./providers";
import type { AssistantRequest } from "../src/lib/ai/protocol";
const request = (provider: AssistantRequest["provider"]): AssistantRequest => ({ provider, notebooks: [], messages: [{ role: "user", content: "Say hello" }] });
test("custom provider parses split SSE records and rejects premature EOF", async () => {
  let incomplete = false;
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk); const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.model, "configured-model"); res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write('data: {"choices":[{"delta":{"con'); await new Promise(resolve => setTimeout(resolve, 10));
    res.write('tent":"Hello"},"finish_reason":null}]}\n\n');
    if (!incomplete) res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'); res.end();
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address() as { port: number };
  try {
    const input = { ...request("custom"), model: "configured-model", endpoint: `http://127.0.0.1:${address.port}/v1/chat/completions` }; let text = "";
    await runEndpoint(input, new AbortController().signal, delta => { text += delta; }); assert.equal(text, "Hello");
    incomplete = true; await assert.rejects(() => runEndpoint(input, new AbortController().signal, () => {}), /before a complete response/);
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});
test("Codex observes notifications emitted before the turn RPC response", async () => {
  const directory = await mkdtemp(join(tmpdir(), "codefolio-codex-fixture-")); const fixture = join(directory, "app-server.mjs");
  await writeFile(fixture, `import {createInterface} from 'node:readline';
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
createInterface({input:process.stdin}).on('line', line => {
 const frame=JSON.parse(line);
 if(frame.method==='initialize') send({id:frame.id,result:{}});
 if(frame.method==='thread/start') { if(frame.params.config['features.shell_tool']!==false) process.exit(2); send({id:frame.id,result:{thread:{id:'thread'}}}); }
 if(frame.method==='turn/start') {
  if(frame.params.input[0].type!=='text' || typeof frame.params.input[0].text!=='string') process.exit(2);
  send({method:'item/agentMessage/delta',params:{threadId:'thread',turnId:'turn',delta:'Hello'}});
  send({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed'}}});
  send({id:frame.id,result:{turn:{id:'turn'}}});
 }
});`);
  try { let text = ""; await runCodex(request("codex"), new AbortController().signal, delta => { text += delta; }, process.execPath, [fixture]); assert.equal(text, "Hello"); }
  finally { await rm(directory, { recursive: true, force: true }); }
});
test("Claude receives cancellation controller in the original query options", async () => {
  const controller = new AbortController(); let passed: AbortController | undefined; let closed = false;
  const fake = ((input: any) => {
    passed = input.options.abortController; assert.deepEqual(input.options.tools, []); assert.equal(input.options.persistSession, false);
    const generator = (async function* () {
      yield { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } } };
      yield { type: "result", subtype: "success", is_error: false };
    })();
    return Object.assign(generator, { close: () => { closed = true; } });
  }) as Parameters<typeof runClaude>[3];
  let text = "";
  await runClaude(request("claude"), controller.signal, delta => { text += delta; controller.abort(); }, fake);
  assert.equal(text, "Hello"); assert.equal(passed?.signal.aborted, true); assert.equal(closed, true);
});

test("missing Codex executable fails and cleans up promptly", { timeout: 5000 }, async () => {
  await assert.rejects(() => runCodex(request("codex"), new AbortController().signal, () => {}, "/nonexistent-codefolio-codex"), /ENOENT|unavailable|exited/);
});
