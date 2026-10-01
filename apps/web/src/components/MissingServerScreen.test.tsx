import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MissingServerScreen } from './MissingServerScreen';

describe('MissingServerScreen', () => {
  it('explains that the build has no server configured', () => {
    render(<MissingServerScreen />);
    expect(
      screen.getByRole('heading', { name: 'This build has no server configured' })
    ).toBeInTheDocument();
    expect(screen.getByText('VITE_API_ORIGIN')).toBeInTheDocument();
  });
});
