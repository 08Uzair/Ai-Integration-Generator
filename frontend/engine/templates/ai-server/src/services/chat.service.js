import { env, APP_META } from '../config/env.js';
import { createAiProvider } from '../providers/ai-provider.js';
import { McpClient } from '../mcp/mcp-client.js';

/**
 * Tells the model exactly how the chat UI renders answers, so replies come
 * back as structured Markdown (paragraphs, tables, cards, images) instead of
 * a wall of plain text. Keep this in sync with the AiChat component.
 */
const RESPONSE_FORMAT_GUIDE = [
  'RESPONSE FORMAT - always answer in GitHub-flavored Markdown:',
  '- Explanations and summaries: short paragraphs (2-4 sentences) separated by a blank line. Use **bold** for key terms and `code` for identifiers and values.',
  '- Lists of records with fields (products, users, orders, carts, endpoints, ...): a Markdown table with one column per field and short headers.',
  '- When a record has an image URL, add an image column using ![alt](absolute-url) so the chat shows the picture.',
  '- A single record, or a summary of one item: use a fenced card block containing JSON on one line, for example:',
  '```card',
  '{"title":"Product name","subtitle":"Brand","image":"https://example.com/image.jpg","description":"Short description","fields":[{"label":"Price","value":"$19.99"},{"label":"Stock","value":"12"}],"link":{"label":"Open","url":"https://example.com/item"}}',
  '```',
  '- 2-4 records: use a fenced cards block containing an array of those objects instead of a table.',
  '- Use bullet lists for steps or options. Never dump raw JSON or tool output unless the user explicitly asks for it.',
  '- Only use values, image URLs and links that came from the tool results - write "-" for missing values and never invent data.',
].join('\n');

/**
 * Chat orchestrator - the AI conversation loop, fully streaming:
 *
 *   client messages
 *     -> system prompt + trimmed history
 *     -> streaming AI turn (text streams to the client WHILE the model thinks)
 *     -> if tool_calls: execute on the MCP server, feed results back
 *     -> repeat (bounded by MAX_TOOL_ROUNDS) - the final answer is streamed
 *
 * Because every turn is streamed, the client sees text appear immediately
 * instead of waiting for the whole (non-streaming) tool-calling round to
 * finish - this removes most of the perceived latency.
 *
 * `emit` receives normalized events:
 *   { type: 'status', message }, { type: 'tool_call', name, args },
 *   { type: 'tool_result', name, success, summary }, { type: 'delta', text },
 *   { type: 'usage', usage }
 */
export class ChatService {
  constructor() {
    this.provider = createAiProvider('groq');
    this.mcp = new McpClient();
    this._connected = false;
    this._connectFailedAt = 0;
  }

  /**
   * Connects to the MCP server once, without ever blocking a chat for long:
   * a recent failed attempt is treated as "unavailable" for 30s so the AI
   * can still answer without tools instead of hanging the request.
   */
  async ensureMcp() {
    if (this._connected) return true;
    if (this._connectFailedAt && Date.now() - this._connectFailedAt < 30_000) {
      return false;
    }
    try {
      await this.mcp.connect();
      this._connected = true;
      this._connectFailedAt = 0;
    } catch {
      this._connectFailedAt = Date.now();
      this.mcp.connected = false;
    }
    return this.mcp.connected;
  }

  #systemPrompt(userId) {
    const toolNames = this.mcp.tools.map((t) => t.name).join(', ') || 'none available';
    // Replaced at generation time with the strict per-tool payload formats
    // defined in the wizard (step 5) - or an empty string when none exist.
    const payloadGuide = {{AI_TOOL_PAYLOAD_GUIDE}};
    const userContext = userId
      ? ` The current user's ID is "${userId}". When you call a tool that needs a user identifier, always pass this exact ID.`
      : '';
    return {
      role: 'system',
      content:
        `You are an AI assistant for ${APP_META.name}, backed by a ${env.GROQ_MODEL} model. ` +
        `You can inspect the application's API (${APP_META.apiBaseUrl}) through these MCP tools: ${toolNames}. ` +
        `When the user asks about the application's data, call the matching tool, wait for its result, ` +
        `then answer using the returned data. Never invent data - if a tool fails or is missing, say so. ` +
        `Keep answers concise and technical.` + userContext +
        `\n\n${RESPONSE_FORMAT_GUIDE}` +
        (payloadGuide ? `\n\n${payloadGuide}` : ''),
    };
  }

  async run({ messages, emit, userId }) {
    if (!messages?.length) throw new Error('No messages provided');
    if (!env.GROQ_API_KEY) {
      await emit({ type: 'error', message: 'GROQ_API_KEY is not configured. Set it in the ai-server/.env file.' });
      return { ok: false };
    }

    await emit({ type: 'status', message: 'Connecting to MCP server...' });
    const mcpConnected = await this.ensureMcp();
    await emit({ type: 'status', message: mcpConnected ? 'Connected to MCP server' : 'MCP server unavailable (AI will answer without tools)' });

    // Only the most recent messages go to the model - smaller payloads are
    // faster and far less likely to trip Groq's rate limits.
    const history = [{ role: 'system', content: this.#systemPrompt(userId).content }, ...trimHistory(messages, env.MAX_HISTORY_MESSAGES)];
    let current = history;

    // ---- Tool-calling loop (bounded) ----
    for (let round = 0; round < env.MAX_TOOL_ROUNDS; round += 1) {
      await emit({ type: 'status', message: 'Thinking...' });

      const turn = await this.#streamTurn(current, emit);

      if (!turn.toolCalls?.length) {
        // No tools requested - the answer already streamed to the client.
        if (!turn.content) await emit({ type: 'delta', text: 'I have nothing to add.' });
        await emit({ type: 'usage', usage: turn.usage });
        return { ok: true };
      }

      await emit({ type: 'status', message: 'Executing tools...' });
      const assistantTurn = {
        role: 'assistant',
        content: turn.content || null,
        tool_calls: turn.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
        })),
      };
      current = [...current, assistantTurn];

      // Announce every call first, then execute them in parallel: independent
      // tool calls no longer wait for each other, so multi-tool turns finish
      // in the time of the slowest call instead of the sum of all calls.
      for (const call of turn.toolCalls) {
        await emit({ type: 'tool_call', name: call.name, args: call.arguments });
      }
      const executedCalls = await Promise.all(
        turn.toolCalls.map(async (call) => {
          try {
            // If the tool's schema wants a user id and the model did not fill
            // it in, inject the request's userId automatically - API routes
            // that require it always receive it.
            return await this.mcp.callTool(call.name, this.#withUserId(call.name, call.arguments, userId));
          } catch (err) {
            return { ok: false, raw: JSON.stringify({ error: err.message }) };
          }
        })
      );

      const toolMessages = [];
      for (let i = 0; i < turn.toolCalls.length; i += 1) {
        const call = turn.toolCalls[i];
        const executed = executedCalls[i];
        await emit({ type: 'tool_result', name: call.name, success: executed.ok, summary: summarize(executed.raw) });
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: executed.raw.slice(0, 20_000) });
      }
      current = [...current, ...toolMessages];
    }

    // Safety valve: too many rounds - one more streaming turn and stop.
    await emit({ type: 'status', message: 'Generating response...' });
    await this.#streamTurn(current, emit);
    return { ok: true };
  }

  /**
   * One streaming turn. Text deltas are forwarded to the client as they
   * arrive (so the UI fills in live), tool calls are aggregated, and the
   * turn's usage is returned.
   */
  async #streamTurn(messages, emit) {
    const contentParts = [];
    let toolCalls = [];
    let usage = null;

    for await (const chunk of this.provider.stream({ messages, tools: this.mcp.aiToolList() })) {
      switch (chunk.type) {
        case 'content_delta':
          contentParts.push(chunk.text);
          await emit({ type: 'delta', text: chunk.text });
          break;
        case 'tool_calls':
          toolCalls = chunk.toolCalls || [];
          break;
        case 'usage':
          usage = chunk.usage;
          break;
        default:
          break;
      }
    }

    return { content: contentParts.join(''), toolCalls, usage };
  }

  async listTools() {
    await this.ensureMcp();
    return this.mcp.tools;
  }

  /**
   * Injects the current user id into tool arguments when the tool's input
   * schema declares a user identifier (`user`, `userId`, `user_id`) - at the
   * top level or nested inside the request body - and the model did not
   * provide it.
   */
  #withUserId(toolName, args, userId) {
    if (!userId || !args) return args;
    const tool = this.mcp.tools.find((t) => t.name === toolName);
    const schema = tool?.inputSchema;
    if (!schema?.properties) return args;

    const clone = { ...args };
    const changed = injectUserId(clone, schema.properties, userId);
    return changed ? clone : args;
  }
}

/** Field names that identify the current user. */
const USER_ID_FIELD = /^user(_?id)?$/i;

/**
 * Recursively walks the tool schema and fills any empty user-id field with
 * the request's userId. Nested objects (e.g. `body.user`) are covered too.
 */
function injectUserId(target, properties, userId) {
  let changed = false;

  for (const [field, prop] of Object.entries(properties || {})) {
    if (USER_ID_FIELD.test(field)) {
      const current = target[field];
      if (current === undefined || current === null || current === '') {
        target[field] = userId;
        changed = true;
      }
      continue;
    }
    if (
      prop?.type === 'object' &&
      prop.properties &&
      target[field] &&
      typeof target[field] === 'object' &&
      !Array.isArray(target[field])
    ) {
      changed = injectUserId(target[field], prop.properties, userId) || changed;
    }
  }

  return changed;
}

/** Keeps only the last `max` messages (the system prompt is added separately). */
function trimHistory(messages, max) {
  if (messages.length <= max) return messages;
  return messages.slice(-max);
}

function summarize(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.success !== undefined) return parsed.success ? 'ok' : `error: ${parsed.error?.message || 'unknown'}`;
    return 'completed';
  } catch {
    return raw.slice(0, 120);
  }
}
