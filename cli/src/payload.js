export const FIELD_TYPES = ['string', 'number', 'boolean', 'object', 'array'];

export function inferType(value) {
  if (value === null) return 'string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

/**
 * Flattens a parsed JSON example into payload field rows. Nested objects and
 * array element shapes are expanded into dotted paths, so EVERY child ends up
 * as its own row in the payload table:
 *
 *   { product: [...], paymentInfo: { id, status, ... } }
 *     -> "product" (array), "paymentInfo.id", "paymentInfo.status", ...
 *
 * Array handling:
 *   - array of primitives  -> one row with type "array"
 *   - array of objects     -> one row with type "array" plus one row per
 *                             element property (paymentInfo-style children)
 */
export function flattenExample(example) {
  if (typeof example !== 'object' || example === null || Array.isArray(example))
    return [];
  const rows = [];

  const walk = (value, prefix) => {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        rows.push({ name: prefix, type: 'array', required: false, description: '' });
        return;
      }
      const first = value[0];
      if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
        rows.push({ name: prefix, type: 'array', required: false, description: '' });
        for (const [k, v] of Object.entries(first)) walk(v, `${prefix}.${k}`);
      } else {
        rows.push({ name: prefix, type: 'array', required: false, description: '' });
      }
      return;
    }

    if (typeof value === 'object' && value !== null) {
      for (const [k, v] of Object.entries(value)) walk(v, prefix ? `${prefix}.${k}` : k);
      return;
    }

    rows.push({ name: prefix, type: inferType(value), required: false, description: '' });
  };

  walk(example, '');
  return rows;
}

/**
 * Parses pasted JSON text into { example, rows }. Throws a readable Error on
 * invalid input so the caller can re-prompt.
 */
export function fieldsFromExampleText(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('No JSON provided.');
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Invalid JSON - fix the syntax before applying.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('The example must be a JSON object, e.g. { "title": "Hello" }.');
  }
  return { example: parsed, rows: flattenExample(parsed) };
}

/** Type-aware placeholder values used when rebuilding a nested payload. */
export function placeholderFor(type) {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'object':
      return {};
    case 'array':
      return [];
    default:
      return '';
  }
}

/**
 * Rebuilds a nested payload object from dotted field rows, e.g.
 *   ["paymentInfo.id", "paymentInfo.status"] -> { paymentInfo: { id: '', status: '' } }
 */
export function buildExampleFromFields(fields) {
  const root = {};
  for (const field of fields || []) {
    if (!field?.name) continue;
    const parts = field.name.split('.');
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (
        typeof node[key] !== 'object' ||
        node[key] === null ||
        Array.isArray(node[key])
      ) {
        node[key] = {};
      }
      node = node[key];
    }
    node[parts[parts.length - 1]] = placeholderFor(field.type);
  }
  return root;
}

/**
 * Expands dotted field names into a nested { properties, required } schema.
 * This is the shape the generator consumes for the MCP tool body schema.
 */
export function expandFields(fields) {
  const root = { properties: {}, required: [] };

  const container = (parent, key) => {
    const existing = parent.properties[key];
    if (existing && typeof existing === 'object' && existing.properties) return existing;
    const node = { type: 'object', properties: {}, required: [] };
    parent.properties[key] = node;
    return node;
  };

  for (const field of fields || []) {
    if (!field?.name) continue;
    const parts = field.name.split('.');
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) node = container(node, parts[i]);
    const leaf = parts[parts.length - 1];
    const existing = node.properties[leaf];
    if (existing && typeof existing === 'object' && existing.properties) {
      existing.type = field.type || 'object';
    } else {
      const prop = { type: field.type || 'string' };
      if (field.description) prop.description = field.description;
      node.properties[leaf] = prop;
    }
    if (field.required) node.required.push(leaf);
  }

  return root;
}
