import { describe, it, expect } from 'vitest';
import { DiagramElementSchema } from '../dtos';

const baseRect = {
  id: 'r1',
  type: 'rectangle' as const,
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  stroke: '#000000',
  strokeWidth: 1,
};

const baseEllipse = {
  id: 'e1',
  type: 'ellipse' as const,
  x: 10,
  y: 10,
  width: 80,
  height: 80,
  stroke: '#000000',
  strokeWidth: 1,
};

describe('DiagramElementSchema — rectangle label field', () => {
  it('parses a rectangle without a label (existing scenes remain valid)', () => {
    const result = DiagramElementSchema.safeParse(baseRect);
    expect(result.success).toBe(true);
  });

  it('parses a rectangle with a label and round-trips the value', () => {
    const input = { ...baseRect, label: 'Start' };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as typeof input).label).toBe('Start');
    }
  });
});

describe('DiagramElementSchema — ellipse label field', () => {
  it('parses an ellipse without a label (existing scenes remain valid)', () => {
    const result = DiagramElementSchema.safeParse(baseEllipse);
    expect(result.success).toBe(true);
  });

  it('parses an ellipse with a label and round-trips the value', () => {
    const input = { ...baseEllipse, label: 'End' };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as typeof input).label).toBe('End');
    }
  });
});

const baseLine = {
  id: 'l1',
  type: 'line' as const,
  points: [[0, 0], [100, 100]] as [[number, number], [number, number]],
  stroke: '#000000',
  strokeWidth: 1,
};

const baseArrow = {
  id: 'a1',
  type: 'arrow' as const,
  points: [[0, 0], [200, 50]] as [[number, number], [number, number]],
  stroke: '#ff0000',
  strokeWidth: 2,
};

describe('DiagramElementSchema — connector waypoints + routeMode fields', () => {
  it('parses a line element without waypoints or routeMode (old scenes remain valid)', () => {
    const result = DiagramElementSchema.safeParse(baseLine);
    expect(result.success).toBe(true);
  });

  it('parses an arrow element without waypoints or routeMode (old scenes remain valid)', () => {
    const result = DiagramElementSchema.safeParse(baseArrow);
    expect(result.success).toBe(true);
  });

  it('parses a line with waypoints and routeMode:auto and round-trips the values', () => {
    const input = { ...baseLine, waypoints: [[50, 25]] as [number, number][], routeMode: 'auto' as const };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as typeof input;
      expect(data.waypoints).toEqual([[50, 25]]);
      expect(data.routeMode).toBe('auto');
    }
  });

  it('parses an arrow with waypoints and routeMode:manual and round-trips the values', () => {
    const input = { ...baseArrow, waypoints: [[10, 20], [30, 40]] as [number, number][], routeMode: 'manual' as const };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as typeof input;
      expect(data.waypoints).toEqual([[10, 20], [30, 40]]);
      expect(data.routeMode).toBe('manual');
    }
  });

  it('rejects a line with more than 50 waypoints', () => {
    const waypoints = Array.from({ length: 51 }, (_, i) => [i, i] as [number, number]);
    const input = { ...baseLine, waypoints };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects a line with an invalid routeMode value', () => {
    const input = { ...baseLine, routeMode: 'bogus' };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects an arrow with an invalid routeMode value', () => {
    const input = { ...baseArrow, routeMode: 'bogus' };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('DiagramElementSchema — connector userBends field', () => {
  it('parses a line without userBends (old scenes remain valid)', () => {
    const result = DiagramElementSchema.safeParse(baseLine);
    expect(result.success).toBe(true);
  });

  it('parses an arrow without userBends (old scenes remain valid)', () => {
    const result = DiagramElementSchema.safeParse(baseArrow);
    expect(result.success).toBe(true);
  });

  it('parses a line with userBends and round-trips the values', () => {
    const input = { ...baseLine, userBends: [[25, 50]] as [number, number][] };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as typeof input).userBends).toEqual([[25, 50]]);
    }
  });

  it('parses an arrow with userBends and round-trips the values', () => {
    const input = { ...baseArrow, userBends: [[10, 30], [60, 80]] as [number, number][] };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as typeof input).userBends).toEqual([[10, 30], [60, 80]]);
    }
  });

  it('rejects a line with more than 50 userBends', () => {
    const userBends = Array.from({ length: 51 }, (_, i) => [i, i] as [number, number]);
    const input = { ...baseLine, userBends };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects an arrow with more than 50 userBends', () => {
    const userBends = Array.from({ length: 51 }, (_, i) => [i, i] as [number, number]);
    const input = { ...baseArrow, userBends };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('parses a line with waypoints + routeMode + userBends together', () => {
    const input = {
      ...baseLine,
      waypoints: [[50, 25], [75, 50]] as [number, number][],
      routeMode: 'manual' as const,
      userBends: [[50, 25]] as [number, number][],
    };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as typeof input;
      expect(data.waypoints).toEqual([[50, 25], [75, 50]]);
      expect(data.routeMode).toBe('manual');
      expect(data.userBends).toEqual([[50, 25]]);
    }
  });

  it('parses an arrow with waypoints + routeMode + userBends together', () => {
    const input = {
      ...baseArrow,
      waypoints: [[100, 25]] as [number, number][],
      routeMode: 'auto' as const,
      userBends: [[100, 25]] as [number, number][],
    };
    const result = DiagramElementSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as typeof input;
      expect(data.waypoints).toEqual([[100, 25]]);
      expect(data.routeMode).toBe('auto');
      expect(data.userBends).toEqual([[100, 25]]);
    }
  });
});
