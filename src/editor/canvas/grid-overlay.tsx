// The layout grids drawn over the page (spec layout-grid-overlay; shown or hidden by src/core/page/grid.ts, sized by
// the page's settings of Guides & Grids, else their defaults: gridSetting): the column grid's bands (count columns of
// a band `width` wide, `gutter` apart, inset by max(margin, (page width − grid width) ÷ 2)), the row grid's bands
// (`height` tall, `gutter` apart) and the dot grid (`spacing` apart), all in page px from the page's top-left corner,
// translucent so the page shows through, in the canvas chrome, never in the page.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { columnBands, columnsOf, dotsOf, gridShown, rowBands, rowsOf } from '../../core/page/grid.ts';
import { useEditorState } from '../store.ts';
import { canvasFrame, geometryOf, nodeBox } from './coordinates.ts';

interface Page {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function GridOverlay() {
  const columns = useEditorState((s) => gridShown(s.document, 'gridColumns'));
  const rows = useEditorState((s) => gridShown(s.document, 'gridRows'));
  const dots = useEditorState((s) => gridShown(s.document, 'gridDots'));
  const root = useEditorState((s) => s.document.pages[0]?.tree.id ?? null);
  // each grid's settings now (one text, so the hook's answer is stable)
  const settings = useEditorState((s) => JSON.stringify({ columns: columnsOf(s.document), rows: rowsOf(s.document), dots: dotsOf(s.document) }));
  const { columns: grid, rows: bands, dots: spots } = JSON.parse(settings) as { columns: ReturnType<typeof columnsOf>; rows: ReturnType<typeof rowsOf>; dots: ReturnType<typeof dotsOf> };
  const { height: rowHeight, gutter: rowGutter } = bands;
  const dotSpacing = spots.spacing;
  const layer = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<Page | null>(null);

  useEffect(() => {
    if (!columns && !rows && !dots) return;
    let request = 0;
    const read = () => {
      const iframe = canvasFrame();
      const g = iframe ? geometryOf(iframe) : null;
      const box = iframe && root !== null ? nodeBox(iframe, root) : null;
      const origin = layer.current?.getBoundingClientRect();
      if (g && box && origin) {
        const next = { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height, zoom: g.zoom };
        setPage((before) => (same(before, next) ? before : next));
      }
      request = requestAnimationFrame(read);
    };
    request = requestAnimationFrame(read);
    return () => cancelAnimationFrame(request);
  }, [columns, rows, dots, root]);

  const rowTops = rows && page ? rowBands(page.height / page.zoom, rowHeight, rowGutter) : [];
  return (
    <div className="chrome__grids" ref={layer}>
      {columns && page
        ? columnBands(page.width / page.zoom, grid).map((c, i) => (
            <div key={i} className="chrome__grid-column" data-region={i === 0 ? 'grid-columns' : undefined} style={{ left: page.x + c.x * page.zoom, top: page.y, width: c.width * page.zoom, height: page.height }} />
          ))
        : null}
      {rows && page
        ? rowTops.map((y, i) => (
            <div key={i} className="chrome__grid-row" data-region={i === 0 ? 'grid-rows' : undefined} style={{ left: page.x, top: page.y + y * page.zoom, width: page.width, height: Math.min(rowHeight * page.zoom, page.height - y * page.zoom) }} />
          ))
        : null}
      {dots && page ? <div className="chrome__grid-dots" data-region="grid-dots" style={{ left: page.x, top: page.y, width: page.width, height: page.height, '--grid-dot': `${dotSpacing * page.zoom}px` } as CSSProperties} /> : null}
    </div>
  );
}
