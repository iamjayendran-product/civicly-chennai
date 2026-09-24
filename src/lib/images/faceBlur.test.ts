import { describe, it, expect } from 'vitest';
import { isSuppressedConsoleMessage } from './faceBlur';

describe('isSuppressedConsoleMessage', () => {
  it('matches the known-benign TFLite XNNPACK delegate log', () => {
    expect(isSuppressedConsoleMessage(['INFO: Created TensorFlow Lite XNNPACK delegate for CPU.'])).toBe(true);
  });

  it('matches regardless of extra console.error arguments', () => {
    expect(isSuppressedConsoleMessage(['Created TensorFlow Lite XNNPACK delegate for CPU', { extra: true }])).toBe(
      true
    );
  });

  it('does not match an unrelated error message', () => {
    expect(isSuppressedConsoleMessage(['TypeError: something actually broke'])).toBe(false);
  });

  it('does not match an empty argument list', () => {
    expect(isSuppressedConsoleMessage([])).toBe(false);
  });
});
