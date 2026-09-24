// The manifest at runtime: every file the app reads, loaded once and parsed by its schema, and the lookups the
// store and the editor need. Nothing here re-lists manifest data; nothing writes it.
// The files come through import.meta.glob typed as unknown, so TypeScript never infers types from the large JSON
// files; the schemas give them their types.
import type { CommandId, DoorId, KeyContextId, MenuId, RegionId } from '../generated/ids.ts';
import {
  checksFileSchema,
  commandsFileSchema,
  elementsFileSchema,
  environmentSchema,
  interactionsFileSchema,
  layoutFileSchema,
  propertiesFileSchema,
  type ChecksFile,
  type Command,
  type Door,
  type ElementsFile,
  type Environment,
  type InteractionsFile,
  type LayoutFile,
  type PropertiesFile,
} from './schema.ts';

const commandModules = import.meta.glob<unknown>('../../manifest/commands/*.json', { eager: true, import: 'default' });
const singleModules = import.meta.glob<unknown>('../../manifest/{checks,elements,environment,interactions,layout,properties}.json', { eager: true, import: 'default' });

function single(name: string): unknown {
  const found = singleModules[`../../manifest/${name}.json`];
  if (found === undefined) throw new Error(`manifest/${name}.json is missing`);
  return found;
}

export interface DoorEntry {
  readonly ref: DoorId;
  readonly command: Command & { readonly id: CommandId };
  readonly door: Door;
}

export interface Manifest {
  readonly environment: Environment;
  readonly elements: ElementsFile;
  readonly properties: PropertiesFile;
  readonly interactions: InteractionsFile;
  readonly layout: LayoutFile;
  readonly checks: ChecksFile;
  // every command, in the order of the command files (sorted by file name) and of each file
  readonly commands: readonly (Command & { readonly id: CommandId })[];
  readonly commandById: ReadonlyMap<CommandId, Command & { readonly id: CommandId }>;
  // every door, in command order
  readonly doors: readonly DoorEntry[];
  readonly doorByRef: ReadonlyMap<DoorId, DoorEntry>;
}

function load(): Manifest {
  const commands = Object.keys(commandModules)
    .sort()
    .flatMap((file) => commandsFileSchema.parse(commandModules[file]).commands) as (Command & { readonly id: CommandId })[];
  const doors: DoorEntry[] = commands.flatMap((command) => command.entryPoints.map((door) => ({ ref: `${command.id}#${door.id}` as DoorId, command, door })));
  return {
    environment: environmentSchema.parse(single('environment')),
    elements: elementsFileSchema.parse(single('elements')),
    properties: propertiesFileSchema.parse(single('properties')),
    interactions: interactionsFileSchema.parse(single('interactions')),
    layout: layoutFileSchema.parse(single('layout')),
    checks: checksFileSchema.parse(single('checks')),
    commands,
    commandById: new Map(commands.map((c) => [c.id, c])),
    doors,
    doorByRef: new Map(doors.map((d) => [d.ref, d])),
  };
}

export const manifest: Manifest = load();

export function commandOf(id: CommandId): Command & { readonly id: CommandId } {
  const command = manifest.commandById.get(id);
  if (!command) throw new Error(`unknown command ${id}`);
  return command;
}

// The doors placed in a region, in their order there (DESIGN.md: "order" 1 is first).
export function doorsIn(region: RegionId): readonly DoorEntry[] {
  return manifest.doors
    .filter((d) => typeof d.door.placement === 'object' && d.door.placement.region === region)
    .sort((a, b) => order(a.door) - order(b.door));
}

function order(door: Door): number {
  return typeof door.placement === 'object' ? door.placement.order : 0;
}

// The menus whose button is drawn in a region, with the button's order there.
export function menuAnchorsIn(region: RegionId): readonly { menu: MenuId; order: number; labelKey: string }[] {
  return manifest.layout.menus.flatMap((m) => m.anchors.filter((a) => a.region === region).map((a) => ({ menu: m.id as MenuId, order: a.order, labelKey: m.labelKey })));
}

// The key contexts a context inherits from, itself first.
export function keyContextChain(context: KeyContextId): readonly KeyContextId[] {
  const chain: KeyContextId[] = [];
  let at: string | null = context;
  while (at !== null && !chain.includes(at as KeyContextId)) {
    chain.push(at as KeyContextId);
    at = manifest.interactions.keyContexts.find((k) => k.id === at)?.inherits ?? null;
  }
  return chain;
}
