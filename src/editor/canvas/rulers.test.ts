import { describe, expect, it } from 'vitest';
import { manifest } from '../../manifest/runtime.ts';
import { rulerSteps } from './rulers.ts';

const value = (id: string) => manifest.interactions.constants.find((c) => c.id === id)?.value;
const STEPS = value('rulers.steps') as readonly number[];
const MIN_LABEL = value('rulers.minLabelSpacing') as number;
const MIN_TICK = value('rulers.minTick') as number;

describe('rulerSteps (spec rulers, Problems in Pager 1)', () => {
  it('labels sit on round values at least the minimum label spacing apart, at every zoom from 10 % to 800 %', () => {
    for (let percent = 10; percent <= 800; percent += 1) {
      const zoom = percent / 100;
      const { label, tick } = rulerSteps(zoom);
      expect(label * zoom, `labels at ${percent} %`).toBeGreaterThanOrEqual(MIN_LABEL);
      expect(STEPS.includes(label) || label % (STEPS[STEPS.length - 1] ?? 1) === 0, `a round label step at ${percent} %`).toBe(true);
      expect(label % tick, `ticks divide the label step at ${percent} %`).toBe(0);
      expect(tick * zoom, `ticks at ${percent} %`).toBeGreaterThanOrEqual(MIN_TICK);
    }
  });

  it('takes the smallest step that is far enough: 50 px at 100 %, 100 px at 60 % (not 50 px 30 screen px apart)', () => {
    expect(rulerSteps(1)).toEqual({ label: 50, tick: 10 });
    expect(rulerSteps(0.6).label).toBe(100);
  });
});
