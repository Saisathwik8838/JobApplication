import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  InvalidStateTransitionError,
} from '../../src/modules/applications/applicationStateMachine.js';

describe('application state machine', () => {
  it('allows the Gate 1 review path', () => {
    expect(() => assertTransition('AWAITING_APPROVAL', 'APPROVED')).not.toThrow();
  });

  it('allows the full two-gate application workflow', () => {
    // Gate 1: Approved -> Autofill
    expect(() => assertTransition('APPROVED', 'FILLING')).not.toThrow();
    // Autofill finishes -> Pauses at Gate 2
    expect(() => assertTransition('FILLING', 'FILLED_AWAITING_RECHECK')).not.toThrow();
    // User confirms submit after human recheck
    expect(() => assertTransition('FILLED_AWAITING_RECHECK', 'RESUBMIT_APPROVED')).not.toThrow();
    // Submission starts
    expect(() => assertTransition('RESUBMIT_APPROVED', 'SUBMITTING')).not.toThrow();
    // Confirmed submitted
    expect(() => assertTransition('SUBMITTING', 'SUBMITTED')).not.toThrow();
  });

  it('allows user to reject or refill at Gate 2', () => {
    expect(() => assertTransition('FILLED_AWAITING_RECHECK', 'REJECTED')).not.toThrow();
    expect(() => assertTransition('FILLED_AWAITING_RECHECK', 'APPROVED')).not.toThrow();
  });

  it('rejects illegal submission without Gate 2 confirmation', () => {
    expect(() => assertTransition('FILLED_AWAITING_RECHECK', 'SUBMITTED')).toThrow(
      InvalidStateTransitionError
    );
    expect(() => assertTransition('FILLED_AWAITING_RECHECK', 'SUBMITTING')).toThrow(
      InvalidStateTransitionError
    );
    expect(() => assertTransition('APPROVED', 'SUBMITTED')).toThrow(InvalidStateTransitionError);
    expect(() => assertTransition('DISCOVERED', 'SUBMITTED')).toThrow(InvalidStateTransitionError);
  });
});
