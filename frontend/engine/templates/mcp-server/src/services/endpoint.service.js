import { toolMap, parseArguments } from '../tools/index.js';
import { executeTargetRequest } from '../adapters/api-adapter.js';
import { TargetApiError } from '../utils/errors.js';

/**
 * Generic tool executor - one function serves every generated tool.
 *
 * Pipeline: validate args (Zod) -> build request (adapter) -> call target API
 * -> normalize response. Error handling is centralized here so tools never
 * leak raw internals to the caller.
 */
export async function executeTool(name, args) {
  const tool = toolMap.get(name);
  if (!tool) {
    throw new TargetApiError(400, 'TOOL_NOT_FOUND', `Unknown tool: ${name}`);
  }

  const validated = parseArguments(tool, args);
  const result = await executeTargetRequest(tool.request, validated);

  // Many APIs answer HTTP 200 with an application-level failure payload
  // (e.g. { success: false, message: "..." }). Treat that as a real error so
  // the AI can never report success for an operation the API rejected.
  const appError = detectApplicationError(result.data);
  if (appError) {
    throw new TargetApiError(422, 'TARGET_API_REJECTED', appError, { body: result.data });
  }

  // Normalize: the MCP content is always JSON with a stable shape.
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true, data: result.data, meta: result.meta }, null, 2),
      },
    ],
  };
}

/**
 * Detects failure signals inside a 2xx response body. Kept intentionally
 * conservative: only explicit `success: false` counts, so valid payloads that
 * happen to contain an `error` field are never misclassified.
 */
function detectApplicationError(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.success === false) {
    return (
      data.message ||
      (typeof data.error === 'string' ? data.error : data.error?.message) ||
      'The target API reported that the operation failed'
    );
  }
  return null;
}