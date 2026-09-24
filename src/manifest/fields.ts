// Lists every field the manifest schemas define, as "<file>:<path>" with "[]" for array items and
// "{}" for record values, so manifest:check can require a reader for each one (consumers.json).
import type { z } from 'zod';
import { FILE_SCHEMAS } from './schema.ts';

interface Def {
  type: string;
  shape?: Record<string, z.ZodType>;
  element?: z.ZodType;
  options?: z.ZodType[];
  innerType?: z.ZodType;
  valueType?: z.ZodType;
  in?: z.ZodType;
}

function defOf(schema: z.ZodType): Def {
  return (schema as unknown as { _zod: { def: Def } })._zod.def;
}

function walk(schema: z.ZodType, path: string, out: Set<string>): void {
  const def = defOf(schema);
  switch (def.type) {
    case 'object':
      for (const [key, field] of Object.entries(def.shape ?? {})) {
        const at = path === '' ? key : `${path}.${key}`;
        out.add(at);
        walk(field, at, out);
      }
      return;
    case 'array':
      if (def.element) walk(def.element, `${path}[]`, out);
      return;
    case 'record':
      if (def.valueType) walk(def.valueType, `${path}{}`, out);
      return;
    case 'union':
      for (const option of def.options ?? []) walk(option, path, out);
      return;
    case 'nullable':
    case 'optional':
      if (def.innerType) walk(def.innerType, path, out);
      return;
    case 'pipe':
      if (def.in) walk(def.in, path, out);
      return;
    default:
      // strings, numbers, literals, enums and the lazy JSON value are leaves
      return;
  }
}

export function schemaFields(): string[] {
  const out: string[] = [];
  for (const [file, schema] of Object.entries(FILE_SCHEMAS)) {
    const fields = new Set<string>();
    walk(schema as z.ZodType, '', fields);
    for (const field of fields) out.push(`${file}:${field}`);
  }
  return out;
}
