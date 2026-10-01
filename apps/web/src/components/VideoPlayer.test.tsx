import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { VideoPlayer } from './VideoPlayer';

describe('VideoPlayer', () => {
  it('plays the public /videos/ file, not the Bearer-only API route', () => {
    const { container } = render(<VideoPlayer videoFilename="v.mp4" thumbnailFilename="t.jpg" />);
    const video = container.querySelector('video')!;
    expect(video.getAttribute('src')).toBe('/videos/v.mp4');
    expect(video.getAttribute('poster')).toBe('/videos/t.jpg');
  });
});
