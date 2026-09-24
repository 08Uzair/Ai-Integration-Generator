export const FIELD_TYPES = ['string', 'number', 'boolean', 'object', 'array'];

export function inferType(value) {
  if (value === null) return 'string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

export function flattenExample(example) {
  if (typeof example !== 'object' || example === null || Array.isArray(example)) return [];
  const rows = [];

  const walk = (value, prefix) => {
    if (Array.isArray(value)) {
      rows.push({ name: prefix, type: 'array', required: false, description: '' });
      if (value.length) {
        const first = value[0];
        if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
          for (const [k, v] of Object.entries(first)) walk(v, `${prefix}.${k}`);
        }
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

export function buildExampleFromFields(fields) {
  const root = {};
  for (const field of fields || []) {
    if (!field?.name) continue;
    const parts = field.name.split('.');
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (typeof node[key] !== 'object' || node[key] === null || Array.isArray(node[key])) {
        node[key] = {};
      }
      node = node[key];
    }
    node[parts[parts.length - 1]] = placeholderFor(field.type);
  }
  return root;
}
