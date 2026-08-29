import { z } from 'zod';
import { TOOLS } from '../config/tools.js';

/**
 * Tool registry consumed by the MCP server and the tool executor.
 * - `inputSchema` is the pristine JSON Schema advertised to MCP clients.
 * - `zodSchema` is derived at module load for runtime validation.
 */
export const toolDefinitions = TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  request: tool.request,
  zodSchema: buildZodSchema(tool.inputSchema),
}));

export const toolMap = new Map(toolDefinitions.map((t) => [t.name, t]));

/** Converts the generated JSON Schema into a Zod schema for validation. */
function buildZodSchema(jsonSchema) {
  const shape = {};
  for (const [name, prop] of Object.entries(jsonSchema?.properties || {})) {
    let field = zodField(prop);
    if (!(jsonSchema?.required || []).includes(name)) field = field.optional();
    shape[name] = field;
  }
  return z.object(shape);
}

/** One JSON Schema property -> Zod type (recursive for nested payloads). */
function zodField(prop) {
  let field;
  switch (prop.type) {
    case 'string':
      field = z.string();
      break;
    case 'number':
      field = z.number();
      break;
    case 'integer':
      field = z.number().int();
      break;
    case 'boolean':
      field = z.boolean();
      break;
    case 'array':
      field = z.array(z.any());
      break;
    case 'object': {
      if (prop.properties && Object.keys(prop.properties).length) {
        const nested = {};
        for (const [name, nestedProp] of Object.entries(prop.properties)) {
          let child = zodField(nestedProp);
          if (!(prop.required || []).includes(name)) child = child.optional();
          nested[name] = child;
        }
        field = z.object(nested);
      } else {
        field = z.object({}).passthrough();
      }
      break;
    }
    default:
      field = z.any();
  }
  if (prop.description || prop.title) field = field.describe(prop.description || prop.title);
  return field;
}

/** Validates + coerces raw MCP arguments into a clean call payload. */
export function parseArguments(tool, args = {}) {
  const parsed = tool.zodSchema.safeParse(args ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid arguments for ${tool.name}: ${issues}`);
  }
  return parsed.data;
}