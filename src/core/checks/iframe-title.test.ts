import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../generated/commands.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { iframeTitleIssues } from './iframe-title.ts';

const node = (id: string, type: string, tag: string, attributes: DocNode['attributes'] = {}, children: DocNode[] = []): DocNode => ({ id: id as NodeId, type: type as DocNode['type'], name: id, tag, attributes, classes: [], styles: {}, text: null, children });
const doc = (children: DocNode[]): DocumentJson => ({ version: 1, pages: [{ id: 'home', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', {}, children) }] });

describe('iframe title checks', () => {
  it('reports only frames with an empty title and clears the issue after the title is set', () => {
    const page = doc([node('Untitled', 'iframe', 'iframe'), node('Blank', 'iframe', 'iframe', { title: '  ' }), node('Named', 'iframe', 'iframe', { title: 'Document preview' })]);
    expect(iframeTitleIssues(page)).toEqual([{ node: 'Untitled', name: 'Untitled' }, { node: 'Blank', name: 'Blank' }]);
    const titled = doc([node('Untitled', 'iframe', 'iframe', { title: 'News' }), node('Blank', 'iframe', 'iframe', { title: 'Document preview' }), node('Named', 'iframe', 'iframe', { title: 'Document preview' })]);
    expect(iframeTitleIssues(titled)).toEqual([]);
  });
});
