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
