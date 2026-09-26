import { allNodes, type DocumentJson, type NodeId } from '../document/model.ts';

export interface IframeTitleIssue {
  readonly node: NodeId;
  readonly name: string;
}

// A missing iframe title prevents a screen reader from naming its embedded content.
// Checks derives this from the current document on every render, so editing Title clears it.
export function iframeTitleIssues(document: DocumentJson): readonly IframeTitleIssue[] {
  return [...allNodes(document)]
    .filter((node) => node.type === 'iframe' && String(node.attributes.title ?? '').trim() === '')
    .map((node) => ({ node: node.id, name: node.name }));
}
