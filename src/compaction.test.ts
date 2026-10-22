import {describe, expect, test} from 'claude-code/testing';

import {CompactAction, compactAction, joinInstructions, reminderText, requestAnswer} from './compaction.ts';

describe('when the model is reminded', () => {
  test('at the crossing while armed, again only after a reading below the threshold', () => {
    expect(compactAction(72, 70, true)).toBe(CompactAction.Remind);
    expect(compactAction(72, 70, false)).toBe(CompactAction.None);
    expect(compactAction(40, 70, false)).toBe(CompactAction.Rearm);
    expect(compactAction(40, 70, true)).toBe(CompactAction.None);
  });

  test('no reading and a threshold of zero do nothing', () => {
    expect(compactAction(undefined, 70, true)).toBe(CompactAction.None);
    expect(compactAction(95, 0, true)).toBe(CompactAction.None);
  });

  test('the texts name the fill and the threshold', () => {
    expect(reminderText(72.5, 70)).toContain('the context window is 72.5% full, past the 70% at which');
    expect(reminderText(72.5, 70)).toContain('call the smart-limits compact tool');
    expect(requestAnswer(72)).toContain('noted at 72%: the conversation is compacted as soon as this turn ends');
    expect(requestAnswer(undefined)).toContain('noted: the conversation is compacted');
  });

  test('the instructions join the model\'s note and the settings', () => {
    expect(joinInstructions('the plan is in plan.md', 'keep the file names')).toBe(
      'the plan is in plan.md\n\nkeep the file names'
    );
    expect(joinInstructions('  ', undefined)).toBe(undefined);
    expect(joinInstructions('', 'keep the file names')).toBe('keep the file names');
  });
});
