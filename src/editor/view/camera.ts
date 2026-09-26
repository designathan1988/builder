// The camera (ARCHITECTURE.md, Command owners; spec zoom-keyboard-buttons): the canvas zoom and the page's horizontal
// place on the stage. The zoom is a workspace preference (ui.preferences.zoom, in percent), restored after a reload;
// absent, the canvas is in Fit mode: the zoom that fits the base breakpoint's width in the stage, with the fit margin on
// both sides, following every change of the stage's size. Any explicit zoom leaves Fit mode until Fit is chosen again.
// Zooming pivots on the middle of the stage (the keys, the buttons, the menu) or on the pointer (Ctrl+wheel, spec
// zoom-wheel-pan): the page point there stays there. view.pan moves the page by the pointer's or the wheel's travel:
// across, the camera's pan; down, a scroll of the page the frame carries out (the page's scroll is the frame's).
// The pivot and Fit need the stage's place and size, a measure of the layout read from the stage element the canvas
// registers (registerStage), when a command runs; the handlers never read the page.
import { activeBreakpoint, BASE_BREAKPOINT } from './breakpoints.ts';
import { message, registerHandler, type Outcome } from '../../core/commands/registry.ts';
import type { StoreState } from '../../core/store/store.ts';
import { numberConstant } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';


const STEP = numberConstant('zoom.step');
export const ZOOM_MIN = numberConstant('zoom.min');
export const ZOOM_MAX = numberConstant('zoom.max');
export const FIT_MARGIN = numberConstant('zoom.fitMargin');

export interface CameraState {
  // the frame's horizontal offset from its place at the fit margin, in screen px, while the page is wider than the stage
  readonly panX: number;
  // the screen point the last zoom pivoted on; null for the middle of the stage
  readonly pivot: { readonly x: number; readonly y: number } | null;
  // the last scroll of the page a pan asked for, in page px, and its number (a new request has a new one)
  readonly scroll: { readonly by: number; readonly count: number };
}

export const INITIAL_CAMERA: CameraState = { panX: 0, pivot: null, scroll: { by: 0, count: 0 } };

// The stage the canvas lays the page out in: its content box's left edge and width (screen px), measured now.
interface Stage {
  readonly left: number;
  readonly width: number;
}
let stageElement: HTMLElement | null = null;
export function registerStage(element: HTMLElement | null): () => void {
  stageElement = element;
  return () => {
    if (stageElement === element) stageElement = null;
  };
}
function measure(): Stage {
  if (stageElement === null) return { left: 0, width: 0 };
  const box = stageElement.getBoundingClientRect();
  const style = getComputedStyle(stageElement);
  const start = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.borderLeftWidth) || 0);
  const end = (parseFloat(style.paddingRight) || 0) + (parseFloat(style.borderRightWidth) || 0);
  return { left: box.left + start, width: box.width - start - end };
}

// the zoom that fits a page this wide (the active breakpoint's width: view/breakpoints.ts) in a stage this wide, within
// the camera's range
export const fitZoom = (width: number, page: number = BASE_BREAKPOINT.width): number => (width > 0 && page > 0 ? Math.min(ZOOM_MAX / 100, Math.max(ZOOM_MIN / 100, (width - 2 * FIT_MARGIN) / page)) : 1);

// the zoom the canvas shows, as a factor: the chosen one, or the one that fits the stage
export const zoomOf = (ui: EditorUi, width: number = measure().width): number => (ui.preferences.zoom !== undefined ? ui.preferences.zoom / 100 : fitZoom(width, activeBreakpoint(ui).width));

// The frame's offset from the fit margin at a zoom: a page narrower than the stage is centred in it; a wider one keeps
// the camera's offset, held so that neither edge of the page leaves a gap on the stage.
export function panOf(ui: EditorUi, zoom: number, width: number = measure().width): number {
  const room = width - 2 * FIT_MARGIN - activeBreakpoint(ui).width * zoom;
  if (room >= 0) return room / 2;
  return Math.min(0, Math.max(room, ui.camera.panX));
}

const clamp = (percent: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(percent)));

// the state zoomed to a percent, the page point under the pivot (a screen point; the middle of the stage without one)
// kept there
function zoomTo(state: StoreState<EditorUi>, percent: number, pivot: { readonly x: number; readonly y: number } | null = null): Outcome<EditorUi> {
  const stage = measure();
  const before = zoomOf(state.ui, stage.width);
  const after = percent / 100;
  const at = pivot !== null ? pivot.x - stage.left : stage.width / 2;
  const pageX = (at - FIT_MARGIN - panOf(state.ui, before)) / before;
  const camera = { ...state.ui.camera, panX: at - FIT_MARGIN - pageX * after, pivot };
  const ui: EditorUi = { ...state.ui, preferences: { ...state.ui.preferences, zoom: percent }, camera };
  return { kind: 'change', ui: { ...ui, camera: { ...camera, panX: panOf(ui, after) } }, message: message('status.zoom.set', { zoom: percent }) };
}

// one step in or out, from the zoom shown (Fit's included); at the limit the step is refused and says so
function step(state: StoreState<EditorUi>, by: number): Outcome<EditorUi> {
  const now = Math.round(zoomOf(state.ui) * 100);
  const next = clamp(now + by);
  if (next === now) return { kind: 'refused', message: message('status.zoom.limit') };
  return zoomTo(state, next);
}

export const zoomIn = registerHandler<'view.zoomIn', EditorUi>('view.zoomIn', ({ state }) => step(state, STEP));
export const zoomOut = registerHandler<'view.zoomOut', EditorUi>('view.zoomOut', ({ state }) => step(state, -STEP));
export const zoomReset = registerHandler<'view.zoomReset', EditorUi>('view.zoomReset', ({ state }) => zoomTo(state, 100));

// a level of the zoom menu stands for the zoom chosen at that level
export const zoomToLevel = registerHandler<'view.zoomTo', EditorUi>(
  'view.zoomTo',
  ({ state }, { percent }) => zoomTo(state, clamp(percent)),
  (state, args) => state.ui.preferences.zoom === args.percent,
);

// Fit: back to Fit mode, the page centred at the fit margin; the status bar says the zoom it fitted to
export const zoomFit = registerHandler<'view.zoomFit', EditorUi>(
  'view.zoomFit',
  ({ state }) => {
    const { zoom: _chosen, ...rest } = state.ui.preferences;
    void _chosen;
    return { kind: 'change', ui: { ...state.ui, preferences: rest, camera: { ...state.ui.camera, panX: 0, pivot: null } }, message: message('status.zoom.fitted', { zoom: Math.round(fitZoom(measure().width, activeBreakpoint(state.ui).width) * 100) }) };
  },
  (state) => state.ui.preferences.zoom === undefined,
);

// Ctrl+wheel: the zoom times the wheel's factor, around the pointer; a notch past the limit is refused and says so
export const zoomAt = registerHandler<'view.zoomAt', EditorUi>('view.zoomAt', ({ state }, { factor, point }) => {
  const now = zoomOf(state.ui) * 100;
  const next = clamp(now * factor);
  if (next === Math.round(now)) return (factor > 1 && next === ZOOM_MAX) || (factor < 1 && next === ZOOM_MIN) ? { kind: 'refused', message: message('status.zoom.limit') } : { kind: 'change' };
  return zoomTo(state, next, point);
});

// the page moved by (dx, dy) screen px: across by the camera's pan (held so the page never leaves a gap), down by a
// scroll of the page the frame carries out
export const pan = registerHandler<'view.pan', EditorUi>('view.pan', ({ state }, { dx, dy }) => {
  const zoom = zoomOf(state.ui);
  const across: EditorUi = { ...state.ui, camera: { ...state.ui.camera, panX: panOf(state.ui, zoom) + dx } };
  const { scroll } = state.ui.camera;
  const camera = { ...across.camera, panX: panOf(across, zoom), scroll: dy !== 0 ? { by: -dy / zoom, count: scroll.count + 1 } : scroll };
  return { kind: 'change', ui: { ...state.ui, camera } };
});
