import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InstallPrompt } from './InstallPrompt';

const { mockCanInstall, mockInstall } = vi.hoisted(() => ({
  mockCanInstall: { value: false },
  mockInstall: vi.fn(),
}));

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({
    canInstall: mockCanInstall.value,
    install: mockInstall,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockCanInstall.value = false;
});

describe('InstallPrompt', () => {
  it('renders nothing when canInstall is false', () => {
    mockCanInstall.value = false;
    const { container } = render(<InstallPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('renders install prompt when canInstall is true', () => {
    mockCanInstall.value = true;
    render(<InstallPrompt />);
    expect(screen.getByText('Install Dinner Planner')).toBeTruthy();
  });

  it('shows Install button when canInstall is true', () => {
    mockCanInstall.value = true;
    render(<InstallPrompt />);
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
  });

  it('shows Not now button', () => {
    mockCanInstall.value = true;
    render(<InstallPrompt />);
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
  });

  it('shows Dismiss button', () => {
    mockCanInstall.value = true;
    render(<InstallPrompt />);
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('calls install() when Install button clicked', () => {
    mockCanInstall.value = true;
    render(<InstallPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(mockInstall).toHaveBeenCalled();
  });

  it('dismisses when Not now clicked', () => {
    mockCanInstall.value = true;
    render(<InstallPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Install Dinner Planner')).toBeNull();
  });

  it('dismisses when X button clicked', () => {
    mockCanInstall.value = true;
    render(<InstallPrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Install Dinner Planner')).toBeNull();
  });
});
