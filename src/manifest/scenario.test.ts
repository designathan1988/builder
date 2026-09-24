import { describe, expect, it } from 'vitest';
import { applyDiff, matchDocument, parsePath, resolveNode, withStandInIds } from './scenario.ts';

interface TestNode {
  readonly id?: string;
  readonly name: string;
  readonly children: TestNode[];
  readonly [field: string]: unknown;
}

const node = (id: string | null, type: string, name: string, tag: string, text: string | null, children: TestNode[] = []): TestNode => ({
  ...(id === null ? {} : { id }),
  type,
  name,
  tag,
  attributes: {},
  classes: [],
  styles: {},
  text,
  children,
});

const fixture = {
  version: 1,
  pages: [
    {
      id: 'p1',
      name: 'Home',
      file: 'index.html',
      tree: node('n1', 'page', 'Page', 'body', null, [node('n2', 'section', 'Section', 'section', null, [node('n3', 'heading', 'Heading', 'h2', 'Title'), node('n4', 'paragraph', 'Paragraph', 'p', 'Body')])]),
    },
  ],
};

describe('document paths (src/manifest/scenario.ts)', () => {
  it('reads node names from the root, and a field after /@', () => {
    expect(parsePath('/Page/Section/Heading')).toEqual({ nodes: ['Page', 'Section', 'Heading'], field: null });
    expect(parsePath('/Page/Section/@styles/desktop/base/padding-top')).toEqual({ nodes: ['Page', 'Section'], field: ['styles', 'desktop', 'base', 'padding-top'] });
    expect(parsePath('/Page/@children')).toEqual({ nodes: ['Page'], field: ['children'] });
  });

  it('resolves a path to exactly one node, and says why when it cannot', () => {
    const found = resolveNode(fixture, ['Page', 'Section', 'Paragraph']);
    expect(typeof found === 'object' && found.node.id).toBe('n4');
    expect(typeof found === 'object' && found.index).toBe(1);
    expect(resolveNode(fixture, ['Page', 'Footer'])).toBe('/Page has no child named "Footer"');
    expect(resolveNode(fixture, ['Main'])).toBe(`no page's root is named "Main"`);
    const twins = { ...fixture, pages: [{ ...fixture.pages[0], tree: node('n1', 'page', 'Page', 'body', null, [node('a', 'div', 'Box', 'div', null), node('b', 'div', 'Box', 'div', null)]) }] };
    expect(resolveNode(twins, ['Page', 'Box'])).toBe('/Page has 2 children named "Box": a node path names one node');
  });
});

describe('the document diff', () => {
  it('removes a node, sets a field deep inside a node, and removes a key', () => {
    const { document, error } = applyDiff(fixture, [
      { op: 'remove', path: '/Page/Section/Paragraph' },
      { op: 'set', path: '/Page/Section/@styles/desktop/base/padding-top', value: '24px' },
      { op: 'set', path: '/Page/Section/Heading/@text', value: 'Welcome' },
    ]);
    expect(error).toBeNull();
    const section = resolveNode(document, ['Page', 'Section']);
    expect(typeof section === 'object' && section.node.styles).toEqual({ desktop: { base: { 'padding-top': '24px' } } });
    expect(typeof section === 'object' && (section.node.children as unknown[]).length).toBe(1);
    const removed = applyDiff(document, [{ op: 'remove', path: '/Page/Section/@styles/desktop/base/padding-top' }]);
    expect(removed.error).toBeNull();
    // the input never changes
    expect(resolveNode(fixture, ['Page', 'Section', 'Paragraph'])).not.toBeTypeOf('string');
  });

  it('places a new node through the children of its parent, in their order, without ids', () => {
    const children = [node(null, 'heading', 'Heading', 'h2', 'Title'), node(null, 'paragraph', 'Lead', 'p', 'New'), node(null, 'paragraph', 'Paragraph', 'p', 'Body')];
    const { document, error } = applyDiff(fixture, [{ op: 'set', path: '/Page/Section/@children', value: children }]);
    expect(error).toBeNull();
    const lead = resolveNode(document, ['Page', 'Section', 'Lead']);
    expect(typeof lead === 'object' && lead.index).toBe(1);
  });

  it('refuses a node value with an id, a field that is no field of a node, a removed root and a path that names nothing', () => {
    expect(applyDiff(fixture, [{ op: 'set', path: '/Page/Section/Heading', value: node('n9', 'heading', 'Heading', 'h2', 'x') }]).error).toEqual({
      index: 0,
      message: '/Page/Section/Heading: a node value omits id: ids are generated',
    });
    expect(applyDiff(fixture, [{ op: 'set', path: '/Page/@id', value: 'x' }]).error?.message).toMatch(/"@id" is not a field of a node/);
    expect(applyDiff(fixture, [{ op: 'remove', path: '/Page' }]).error?.message).toBe("/Page: a page's root is never removed");
    expect(applyDiff(fixture, [{ op: 'remove', path: '/Page/Section/@styles/desktop' }]).error?.message).toBe('/Page/Section/@styles/desktop: there is nothing at this path to remove');
    expect(applyDiff(fixture, [{ op: 'remove', path: '/Page/Section/@name' }]).error?.message).toMatch(/set, never removed/);
  });
});

describe('matching the document the test port reads', () => {
  it('lets a node without an id in the expectation match any id, and reports every other difference', () => {
    const expected = applyDiff(fixture, [{ op: 'set', path: '/Page/Section/@children', value: [node(null, 'heading', 'Heading', 'h2', 'Title')] }]).document;
    const actual = structuredClone(fixture);
    actual.pages[0]?.tree.children[0]?.children.splice(1, 1);
    expect(matchDocument(actual, expected)).toEqual([]);
    const renamed = structuredClone(actual);
    (renamed.pages[0]?.tree.children[0] as { name: string }).name = 'Hero';
    expect(matchDocument(renamed, expected)).toEqual(['/pages/0/tree/children/0/name: expected "Section", found "Hero"']);
  });

  it('gives stand-in ids to nodes without one, so an expected document validates as a document', () => {
    const expected = applyDiff(fixture, [{ op: 'set', path: '/Page/Section/@children', value: [node(null, 'heading', 'Heading', 'h2', 'Title')] }]).document;
    const filled = withStandInIds(expected) as typeof fixture;
    expect(filled.pages[0]?.tree.children[0]?.children[0]?.id).toBe('~new-1');
    expect(filled.pages[0]?.tree.id).toBe('n1');
  });
});
