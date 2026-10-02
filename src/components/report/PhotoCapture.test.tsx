import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PhotoCapture } from './PhotoCapture';

describe('PhotoCapture', () => {
  it('lets mobile users pick from the gallery, not only the camera', () => {
    const { container } = render(<PhotoCapture photos={[]} onChange={() => {}} />);
    const input = container.querySelector('input[type="file"]')!;
    expect(input).toHaveAttribute('accept', 'image/*');
    // `capture` forces the camera and hides the photo library on mobile browsers.
    expect(input).not.toHaveAttribute('capture');
  });
});
