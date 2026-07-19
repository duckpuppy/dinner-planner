import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PlanDayCard, isEntryPlanned, type WeekEntryRef } from './PlanDayCard';
import type { DinnerEntry } from '@/lib/api';

// Mock dnd-kit — avoid needing pointer events / drag context in unit tests
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
  }),
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Translate: { toString: vi.fn(() => '') },
  },
}));

function makeEntry(overrides: Partial<DinnerEntry> = {}): DinnerEntry {
  return {
    id: 'entry-1',
    date: '2024-06-10',
    dayOfWeek: 1,
    type: 'assembled',
    customText: null,
    restaurantName: null,
    restaurantNotes: null,
    completed: false,
    skipped: false,
    scale: 1,
    sourceEntryId: null,
    sourceEntryDishName: null,
    mainDish: null,
    sideDishes: [],
    preparations: [],
    createdAt: '2024-06-10T00:00:00Z',
    updatedAt: '2024-06-10T00:00:00Z',
    ...overrides,
  };
}

afterEach(() => cleanup());

describe('isEntryPlanned', () => {
  it('returns false for empty assembled entry', () => {
    expect(isEntryPlanned(makeEntry())).toBe(false);
  });

  it('returns true for assembled entry with main dish', () => {
    expect(isEntryPlanned(makeEntry({ mainDish: { id: '1', name: 'Pasta', type: 'main' } }))).toBe(
      true
    );
  });

  it('returns true for non-assembled types', () => {
    expect(isEntryPlanned(makeEntry({ type: 'fend_for_self' }))).toBe(true);
    expect(isEntryPlanned(makeEntry({ type: 'dining_out' }))).toBe(true);
    expect(isEntryPlanned(makeEntry({ type: 'custom', customText: 'Pizza' }))).toBe(true);
  });
});

const defaultWeekEntries: WeekEntryRef[] = [
  { id: 'entry-0', dayOfWeek: 0, date: '2024-06-09', type: 'assembled' },
  { id: 'entry-1', dayOfWeek: 1, date: '2024-06-10', type: 'assembled' },
  { id: 'entry-2', dayOfWeek: 2, date: '2024-06-11', type: 'assembled' },
];

describe('PlanDayCard', () => {
  const onEdit = vi.fn();
  const onClear = vi.fn();
  const onMoveSide = vi.fn();

  function renderCard(
    overrides: Partial<DinnerEntry> = {},
    props: {
      isDragging?: boolean;
      isOver?: boolean;
      weekEntries?: WeekEntryRef[];
    } = {}
  ) {
    return render(
      <PlanDayCard
        entry={makeEntry(overrides)}
        weekEntries={props.weekEntries ?? defaultWeekEntries}
        onEdit={onEdit}
        onClear={onClear}
        onMoveSide={onMoveSide}
        isDragging={props.isDragging ?? false}
        isOver={props.isOver ?? false}
      />
    );
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Add meal" button for empty assembled entry', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /add meal for monday/i })).toBeInTheDocument();
  });

  it('calls onEdit when "Add meal" is clicked', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /add meal for monday/i }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('renders dish name for planned assembled entry', () => {
    renderCard({ mainDish: { id: '1', name: 'Chicken Tikka', type: 'main' } });
    expect(screen.getByText('Chicken Tikka')).toBeInTheDocument();
  });

  it('renders side dishes when present', () => {
    renderCard({
      mainDish: { id: '1', name: 'Steak', type: 'main' },
      sideDishes: [{ id: '2', name: 'Salad', type: 'side' }],
    });
    expect(screen.getByText(/salad/i)).toBeInTheDocument();
  });

  it('renders side dishes for an unplanned entry with no main dish', () => {
    renderCard({
      id: 'entry-1',
      mainDish: null,
      sideDishes: [{ id: '2', name: 'Salad', type: 'side' }],
    });
    expect(screen.getByText(/salad/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add meal for monday/i })).toBeInTheDocument();
  });

  it('renders a "Move to a different day" select for each side dish', () => {
    renderCard({
      id: 'entry-1',
      mainDish: { id: '1', name: 'Steak', type: 'main' },
      sideDishes: [{ id: '2', name: 'Salad', type: 'side' }],
    });
    expect(screen.getByLabelText(/move salad to a different day/i)).toBeInTheDocument();
  });

  it('does not offer non-assembled entries as move targets', () => {
    renderCard(
      {
        id: 'entry-1',
        mainDish: { id: '1', name: 'Steak', type: 'main' },
        sideDishes: [{ id: '2', name: 'Salad', type: 'side' }],
      },
      {
        weekEntries: [
          { id: 'entry-0', dayOfWeek: 0, date: '2024-06-09', type: 'dining_out' },
          { id: 'entry-1', dayOfWeek: 1, date: '2024-06-10', type: 'assembled' },
        ],
      }
    );
    // No move control is offered at all when there are no assembled-type
    // days to move the side dish to.
    expect(screen.queryByLabelText(/move salad to a different day/i)).not.toBeInTheDocument();
  });

  it('calls onMoveSide with dish id, source entry id, and target entry id when a day is selected', () => {
    renderCard({
      id: 'entry-1',
      mainDish: { id: '1', name: 'Steak', type: 'main' },
      sideDishes: [{ id: '2', name: 'Salad', type: 'side' }],
    });
    const select = screen.getByLabelText(/move salad to a different day/i);
    fireEvent.change(select, { target: { value: 'entry-2' } });
    expect(onMoveSide).toHaveBeenCalledWith('2', 'entry-1', 'entry-2');
  });

  it('renders fend_for_self label', () => {
    renderCard({ type: 'fend_for_self' });
    expect(screen.getByText('Fend for Yourself')).toBeInTheDocument();
  });

  it('renders dining_out with restaurant name', () => {
    renderCard({ type: 'dining_out', restaurantName: 'Olive Garden' });
    expect(screen.getByText('Olive Garden')).toBeInTheDocument();
  });

  it('renders custom type with text', () => {
    renderCard({ type: 'custom', customText: 'Homemade pizza' });
    expect(screen.getByText('Homemade pizza')).toBeInTheDocument();
  });

  it('shows edit and clear buttons for planned entry', () => {
    renderCard({ mainDish: { id: '1', name: 'Pasta', type: 'main' } });
    expect(screen.getByRole('button', { name: /edit meal for monday/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear meal for monday/i })).toBeInTheDocument();
  });

  it('calls onClear when clear button is clicked', () => {
    renderCard({ mainDish: { id: '1', name: 'Pasta', type: 'main' } });
    fireEvent.click(screen.getByRole('button', { name: /clear meal for monday/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('calls onEdit when edit button is clicked', () => {
    renderCard({ mainDish: { id: '1', name: 'Pasta', type: 'main' } });
    fireEvent.click(screen.getByRole('button', { name: /edit meal for monday/i }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('applies opacity when isDragging', () => {
    const { container } = renderCard(
      { mainDish: { id: '1', name: 'Pasta', type: 'main' } },
      { isDragging: true }
    );
    expect(container.firstChild).toHaveClass('opacity-50');
  });

  it('applies highlight styles when isOver', () => {
    const { container } = renderCard(
      { mainDish: { id: '1', name: 'Pasta', type: 'main' } },
      { isOver: true }
    );
    expect(container.firstChild).toHaveClass('border-primary');
  });
});
