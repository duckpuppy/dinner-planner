import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ConfirmDialog', () => {
  describe('closed state', () => {
    it('renders nothing when open=false', () => {
      const { container } = render(
        <ConfirmDialog
          open={false}
          title="Delete?"
          description="This cannot be undone"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('open state', () => {
    it('renders title and description', () => {
      render(
        <ConfirmDialog
          open
          title="Delete Item"
          description="This cannot be undone"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      expect(screen.getByText('Delete Item')).toBeTruthy();
      expect(screen.getByText('This cannot be undone')).toBeTruthy();
    });

    it('renders default confirmText "Confirm"', () => {
      render(
        <ConfirmDialog
          open
          title="Are you sure?"
          description="desc"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();
    });

    it('renders custom confirmText', () => {
      render(
        <ConfirmDialog
          open
          title="Delete?"
          description="desc"
          confirmText="Delete"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    });

    it('renders Cancel button', () => {
      render(
        <ConfirmDialog
          open
          title="Test"
          description="desc"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    });

    it('calls onConfirm when confirm button clicked', () => {
      const onConfirm = vi.fn();
      render(
        <ConfirmDialog
          open
          title="Test"
          description="desc"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(onConfirm).toHaveBeenCalled();
    });

    it('calls onCancel when Cancel button clicked', () => {
      const onCancel = vi.fn();
      render(
        <ConfirmDialog
          open
          title="Test"
          description="desc"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancel).toHaveBeenCalled();
    });

    it('calls onCancel when backdrop overlay clicked', () => {
      const onCancel = vi.fn();
      const { container } = render(
        <ConfirmDialog
          open
          title="Test"
          description="desc"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      );
      // The backdrop is a fixed inset-0 div with onClick
      const backdrop = container.ownerDocument.querySelector('.fixed.inset-0.bg-black\\/50');
      if (backdrop) fireEvent.click(backdrop);
      expect(onCancel).toHaveBeenCalled();
    });

    it('calls onCancel when Escape key pressed', () => {
      const onCancel = vi.fn();
      render(
        <ConfirmDialog
          open
          title="Test"
          description="desc"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalled();
    });

    it('does NOT call onCancel on Escape when dialog is closed', () => {
      const onCancel = vi.fn();
      render(
        <ConfirmDialog
          open={false}
          title="Test"
          description="desc"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('shows "Please wait..." when loading', () => {
      render(
        <ConfirmDialog
          open
          title="Test"
          description="desc"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          loading
        />
      );
      expect(screen.getByText('Please wait...')).toBeTruthy();
    });

    it('disables buttons when loading', () => {
      render(
        <ConfirmDialog
          open
          title="Test"
          description="desc"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          loading
        />
      );
      const buttons = screen.getAllByRole('button');
      buttons.forEach((btn) => {
        expect((btn as HTMLButtonElement).disabled).toBe(true);
      });
    });
  });
});
