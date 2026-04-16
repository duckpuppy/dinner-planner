import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DishPickerModal } from './DishPickerModal';

const dishes = [
  { id: '1', name: 'Pasta', tags: [], dietaryTags: [] },
  { id: '2', name: 'Chicken', tags: [], dietaryTags: [] },
  { id: '3', name: 'Salad', tags: [], dietaryTags: [] },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DishPickerModal', () => {
  describe('render behavior', () => {
    it('renders nothing when closed', () => {
      render(
        <DishPickerModal
          open={false}
          mode="single"
          dishes={dishes}
          selected={new Set()}
          onToggle={vi.fn()}
          onClose={vi.fn()}
          title="Pick a Dish"
        />
      );
      expect(screen.queryByText('Pick a Dish')).toBeNull();
    });

    it('renders when open', () => {
      render(
        <DishPickerModal
          open={true}
          mode="single"
          dishes={dishes}
          selected={new Set()}
          onToggle={vi.fn()}
          onClose={vi.fn()}
          title="Pick a Dish"
        />
      );
      expect(screen.getByText('Pick a Dish')).toBeTruthy();
      expect(screen.getByText('Pasta')).toBeTruthy();
      expect(screen.getByText('Chicken')).toBeTruthy();
    });
  });

  describe('search filtering', () => {
    it('filters dishes by search query', () => {
      render(
        <DishPickerModal
          open={true}
          mode="single"
          dishes={dishes}
          selected={new Set()}
          onToggle={vi.fn()}
          onClose={vi.fn()}
          title="Pick a Dish"
        />
      );
      const searchInput = screen.getByPlaceholderText('Search dishes...');
      fireEvent.change(searchInput, { target: { value: 'pas' } });
      expect(screen.getByText('Pasta')).toBeTruthy();
      expect(screen.queryByText('Chicken')).toBeNull();
      expect(screen.queryByText('Salad')).toBeNull();
    });

    it('shows empty state when no dishes match search', () => {
      render(
        <DishPickerModal
          open={true}
          mode="single"
          dishes={dishes}
          selected={new Set()}
          onToggle={vi.fn()}
          onClose={vi.fn()}
          title="Pick a Dish"
        />
      );
      const searchInput = screen.getByPlaceholderText('Search dishes...');
      fireEvent.change(searchInput, { target: { value: 'zzznomatch' } });
      expect(screen.getByText('No dishes found')).toBeTruthy();
    });

    it('search is case insensitive', () => {
      render(
        <DishPickerModal
          open={true}
          mode="single"
          dishes={dishes}
          selected={new Set()}
          onToggle={vi.fn()}
          onClose={vi.fn()}
          title="Pick a Dish"
        />
      );
      const searchInput = screen.getByPlaceholderText('Search dishes...');
      fireEvent.change(searchInput, { target: { value: 'PASTA' } });
      expect(screen.getByText('Pasta')).toBeTruthy();
    });
  });

  describe('single-select mode', () => {
    it('calls onToggle and onClose when a row is tapped', () => {
      const onToggle = vi.fn();
      const onClose = vi.fn();
      render(
        <DishPickerModal
          open={true}
          mode="single"
          dishes={dishes}
          selected={new Set()}
          onToggle={onToggle}
          onClose={onClose}
          title="Pick a Dish"
        />
      );
      fireEvent.click(screen.getByText('Pasta'));
      expect(onToggle).toHaveBeenCalledWith('1');
      expect(onClose).toHaveBeenCalled();
    });

    it('does not show Done footer button in single mode', () => {
      render(
        <DishPickerModal
          open={true}
          mode="single"
          dishes={dishes}
          selected={new Set()}
          onToggle={vi.fn()}
          onClose={vi.fn()}
          title="Pick a Dish"
        />
      );
      expect(screen.queryByRole('button', { name: /done/i })).toBeNull();
    });
  });

  describe('multi-select mode', () => {
    it('calls onToggle but NOT onClose when a row is tapped', () => {
      const onToggle = vi.fn();
      const onClose = vi.fn();
      render(
        <DishPickerModal
          open={true}
          mode="multi"
          dishes={dishes}
          selected={new Set()}
          onToggle={onToggle}
          onClose={onClose}
          title="Side Dishes"
        />
      );
      fireEvent.click(screen.getByText('Salad'));
      expect(onToggle).toHaveBeenCalledWith('3');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('shows Done button with count when items are selected', () => {
      render(
        <DishPickerModal
          open={true}
          mode="multi"
          dishes={dishes}
          selected={new Set(['1', '3'])}
          onToggle={vi.fn()}
          onClose={vi.fn()}
          title="Side Dishes"
        />
      );
      expect(screen.getByRole('button', { name: /done \(2 selected\)/i })).toBeTruthy();
    });

    it('shows Done button without count when nothing is selected', () => {
      render(
        <DishPickerModal
          open={true}
          mode="multi"
          dishes={dishes}
          selected={new Set()}
          onToggle={vi.fn()}
          onClose={vi.fn()}
          title="Side Dishes"
        />
      );
      expect(screen.getByRole('button', { name: /^done$/i })).toBeTruthy();
    });

    it('calls onClose when Done button is clicked', () => {
      const onClose = vi.fn();
      render(
        <DishPickerModal
          open={true}
          mode="multi"
          dishes={dishes}
          selected={new Set()}
          onToggle={vi.fn()}
          onClose={onClose}
          title="Side Dishes"
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Escape key', () => {
    it('calls onClose when Escape is pressed', () => {
      const onClose = vi.fn();
      render(
        <DishPickerModal
          open={true}
          mode="single"
          dishes={dishes}
          selected={new Set()}
          onToggle={vi.fn()}
          onClose={onClose}
          title="Pick a Dish"
        />
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('overlay click', () => {
    it('calls onClose when overlay is clicked', () => {
      const onClose = vi.fn();
      const { container } = render(
        <DishPickerModal
          open={true}
          mode="single"
          dishes={dishes}
          selected={new Set()}
          onToggle={vi.fn()}
          onClose={onClose}
          title="Pick a Dish"
        />
      );
      // The overlay is the fixed inset-0 bg-black/50 div
      const overlay = container.ownerDocument.querySelector('.bg-black\\/50');
      if (overlay) fireEvent.click(overlay);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
