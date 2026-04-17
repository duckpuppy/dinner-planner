import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RestaurantsPage, RestaurantDetailRoute } from './RestaurantsPage';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/lib/api', () => ({
  restaurants: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listDishes: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonList: () => <div data-testid="skeleton-list" />,
}));

vi.mock('@/components/ErrorState', () => ({
  ErrorState: ({ message }: { message: string }) => <div data-testid="error-state">{message}</div>,
}));

import { restaurants as restaurantsApi } from '@/lib/api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockRestaurant = {
  id: 'r-1',
  name: 'Pizza Palace',
  cuisineType: 'Italian',
  location: '123 Main St',
  visitCount: 5,
  averageRating: 4.2,
  lastVisitedAt: '2024-01-15T00:00:00.000Z',
  notes: 'Great thin crust',
  archived: false,
  createdBy: { id: 'u-1', displayName: 'Alice' },
  createdAt: '2023-06-01T00:00:00.000Z',
  updatedAt: '2024-01-15T00:00:00.000Z',
};

const mockRestaurant2 = {
  id: 'r-2',
  name: 'Sushi Station',
  cuisineType: 'Japanese',
  location: '456 Oak Ave',
  visitCount: 2,
  averageRating: null,
  lastVisitedAt: null,
  notes: null,
  archived: false,
  createdBy: { id: 'u-1', displayName: 'Alice' },
  createdAt: '2023-07-01T00:00:00.000Z',
  updatedAt: '2023-07-01T00:00:00.000Z',
};

const mockDish = {
  id: 'rd-1',
  restaurantId: 'r-1',
  name: 'Margherita Pizza',
  notes: 'Classic',
  averageRating: 4.5,
  ratingCount: 3,
  createdAt: '2023-06-01T00:00:00.000Z',
  updatedAt: '2023-06-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function ListWrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/restaurants']}>
      <QueryClientProvider client={makeQC()}>
        <Routes>
          <Route path="/restaurants" element={children} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function DetailWrapper({ id }: { id: string }) {
  return (
    <MemoryRouter initialEntries={[`/restaurants/${id}`]}>
      <QueryClientProvider client={makeQC()}>
        <Routes>
          <Route path="/restaurants/:id" element={<RestaurantDetailRoute />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// RestaurantsPage tests
// ---------------------------------------------------------------------------

describe('RestaurantsPage', () => {
  it('renders loading skeleton while fetching', () => {
    vi.mocked(restaurantsApi.list).mockReturnValue(new Promise(() => {}));
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
  });

  it('renders restaurant cards after data loads', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({
      restaurants: [mockRestaurant, mockRestaurant2],
      total: 2,
    });

    render(<RestaurantsPage />, { wrapper: ListWrapper });

    await waitFor(() => {
      expect(screen.getByText('Pizza Palace')).toBeInTheDocument();
      expect(screen.getByText('Sushi Station')).toBeInTheDocument();
    });
  });

  it('shows visit count and rating on cards', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({
      restaurants: [mockRestaurant],
      total: 1,
    });

    render(<RestaurantsPage />, { wrapper: ListWrapper });

    await waitFor(() => {
      expect(screen.getByText('5 visits')).toBeInTheDocument();
      expect(screen.getByText('4.2')).toBeInTheDocument();
    });
  });

  it('filters restaurants by search query', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({
      restaurants: [mockRestaurant, mockRestaurant2],
      total: 2,
    });

    render(<RestaurantsPage />, { wrapper: ListWrapper });

    await waitFor(() => {
      expect(screen.getByText('Pizza Palace')).toBeInTheDocument();
    });

    const searchInput = screen.getByRole('searchbox', { name: /search restaurants/i });
    fireEvent.change(searchInput, { target: { value: 'sushi' } });

    await waitFor(() => {
      expect(screen.queryByText('Pizza Palace')).not.toBeInTheDocument();
      expect(screen.getByText('Sushi Station')).toBeInTheDocument();
    });
  });

  it('shows empty state when no restaurants exist', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({ restaurants: [], total: 0 });

    render(<RestaurantsPage />, { wrapper: ListWrapper });

    await waitFor(() => {
      expect(screen.getByText('No restaurants yet')).toBeInTheDocument();
      expect(screen.getByText('Add your first restaurant')).toBeInTheDocument();
    });
  });

  it('shows empty state message when search has no results', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({
      restaurants: [mockRestaurant],
      total: 1,
    });

    render(<RestaurantsPage />, { wrapper: ListWrapper });

    await waitFor(() => screen.getByText('Pizza Palace'));

    const searchInput = screen.getByRole('searchbox', { name: /search restaurants/i });
    fireEvent.change(searchInput, { target: { value: 'zzznomatch' } });

    expect(screen.getByText('No restaurants match your search')).toBeInTheDocument();
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(restaurantsApi.list).mockRejectedValue(new Error('Network error'));

    render(<RestaurantsPage />, { wrapper: ListWrapper });

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });
  });

  it('navigates to detail on card click', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({
      restaurants: [mockRestaurant],
      total: 1,
    });

    render(<RestaurantsPage />, { wrapper: ListWrapper });

    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.click(screen.getByText('Pizza Palace'));

    expect(mockNavigate).toHaveBeenCalledWith('/restaurants/r-1');
  });

  it('opens create modal when Add button is clicked', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({ restaurants: [], total: 0 });

    render(<RestaurantsPage />, { wrapper: ListWrapper });

    await waitFor(() => screen.getByText('No restaurants yet'));

    fireEvent.click(screen.getByRole('button', { name: /add restaurant/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RestaurantDetailRoute tests
// ---------------------------------------------------------------------------

describe('RestaurantDetailRoute', () => {
  it('renders loading state initially', () => {
    vi.mocked(restaurantsApi.get).mockReturnValue(new Promise(() => {}));
    vi.mocked(restaurantsApi.listDishes).mockReturnValue(new Promise(() => {}));

    render(<DetailWrapper id="r-1" />);

    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
  });

  it('renders restaurant info after load', async () => {
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });

    render(<DetailWrapper id="r-1" />);

    await waitFor(() => {
      expect(screen.getByText('Pizza Palace')).toBeInTheDocument();
      expect(screen.getByText('Italian')).toBeInTheDocument();
      expect(screen.getByText('123 Main St')).toBeInTheDocument();
      expect(screen.getByText('Great thin crust')).toBeInTheDocument();
    });
  });

  it('renders stats correctly', async () => {
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });

    render(<DetailWrapper id="r-1" />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('4.2')).toBeInTheDocument();
    });
  });

  it('renders dishes list', async () => {
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [mockDish] });

    render(<DetailWrapper id="r-1" />);

    await waitFor(() => {
      expect(screen.getByText('Margherita Pizza')).toBeInTheDocument();
      expect(screen.getByText('Classic')).toBeInTheDocument();
    });
  });

  it('shows empty dishes state when no dishes', async () => {
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });

    render(<DetailWrapper id="r-1" />);

    await waitFor(() => {
      expect(screen.getByText('No dishes tracked yet')).toBeInTheDocument();
    });
  });

  it('navigates back on back button click', async () => {
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });

    render(<DetailWrapper id="r-1" />);

    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.click(screen.getByRole('button', { name: /back to restaurants/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/restaurants');
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(restaurantsApi.get).mockRejectedValue(new Error('Not found'));
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });

    render(<DetailWrapper id="r-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// RestaurantsPage — additional coverage
// ---------------------------------------------------------------------------

describe('RestaurantsPage — create modal', () => {
  beforeEach(() => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({ restaurants: [], total: 0 });
  });

  it('opens create modal from empty state CTA button', async () => {
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('Add your first restaurant'));
    fireEvent.click(screen.getByText('Add your first restaurant'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes create modal via X button', async () => {
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('No restaurants yet'));
    fireEvent.click(screen.getByRole('button', { name: /add restaurant/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes create modal via Cancel button', async () => {
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('No restaurants yet'));
    fireEvent.click(screen.getByRole('button', { name: /add restaurant/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes create modal via backdrop click', async () => {
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('No restaurants yet'));
    fireEvent.click(screen.getByRole('button', { name: /add restaurant/i }));
    // The backdrop is the fixed inset-0 overlay div with bg-black/50
    const dialog = screen.getByRole('dialog');
    // The overlay is the first child div of the dialog container (absolute inset-0 bg-black/50)
    const overlay = dialog.querySelector('div[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(overlay);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not submit create form when name is empty', async () => {
    vi.mocked(restaurantsApi.create).mockResolvedValue({
      id: 'r-new',
      name: '',
      cuisineType: null,
      location: null,
      notes: null,
      archived: false,
      visitCount: 0,
      averageRating: null,
      lastVisitedAt: null,
      createdBy: { id: 'u-1', displayName: 'Alice' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('No restaurants yet'));
    fireEvent.click(screen.getByRole('button', { name: /add restaurant/i }));
    // Name is empty — Save button disabled
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(restaurantsApi.create).not.toHaveBeenCalled();
  });

  it('submits create form and navigates to new restaurant', async () => {
    vi.mocked(restaurantsApi.create).mockResolvedValue({
      id: 'r-new',
      name: 'New Place',
      cuisineType: 'Thai',
      location: 'Downtown',
      notes: null,
      archived: false,
      visitCount: 0,
      averageRating: null,
      lastVisitedAt: null,
      createdBy: { id: 'u-1', displayName: 'Alice' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('No restaurants yet'));
    fireEvent.click(screen.getByRole('button', { name: /add restaurant/i }));

    fireEvent.change(screen.getByLabelText(/name \*/i), { target: { value: 'New Place' } });
    fireEvent.change(screen.getByLabelText(/cuisine type/i), { target: { value: 'Thai' } });
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: 'Downtown' } });
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: 'Nice patio' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(restaurantsApi.create).toHaveBeenCalledWith({
        name: 'New Place',
        cuisineType: 'Thai',
        location: 'Downtown',
        notes: 'Nice patio',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/restaurants/r-new');
    });
  });

  it('shows error toast when create mutation fails', async () => {
    const { toast } = await import('sonner');
    vi.mocked(restaurantsApi.create).mockRejectedValue(new Error('Server error'));
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('No restaurants yet'));
    fireEvent.click(screen.getByRole('button', { name: /add restaurant/i }));
    fireEvent.change(screen.getByLabelText(/name \*/i), { target: { value: 'Bad Place' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to add restaurant');
    });
  });
});

describe('RestaurantsPage — archive toggle', () => {
  it('toggles to show archived restaurants', async () => {
    vi.mocked(restaurantsApi.list)
      .mockResolvedValueOnce({ restaurants: [mockRestaurant], total: 1 })
      .mockResolvedValueOnce({ restaurants: [], total: 0 });

    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.click(screen.getByRole('button', { name: /archived/i }));

    await waitFor(() => {
      expect(screen.getByText('No archived restaurants')).toBeInTheDocument();
    });
  });

  it('shows archived label with correct aria-pressed state', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({ restaurants: [], total: 0 });
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('No restaurants yet'));

    const archiveButton = screen.getByRole('button', { name: /archived/i });
    expect(archiveButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(archiveButton);
    expect(archiveButton).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('RestaurantsPage — search filtering edge cases', () => {
  it('filters by cuisineType', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({
      restaurants: [mockRestaurant, mockRestaurant2],
      total: 2,
    });
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.change(screen.getByRole('searchbox', { name: /search restaurants/i }), {
      target: { value: 'japanese' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Pizza Palace')).not.toBeInTheDocument();
      expect(screen.getByText('Sushi Station')).toBeInTheDocument();
    });
  });

  it('filters by location', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({
      restaurants: [mockRestaurant, mockRestaurant2],
      total: 2,
    });
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.change(screen.getByRole('searchbox', { name: /search restaurants/i }), {
      target: { value: '456 oak' },
    });

    await waitFor(() => {
      expect(screen.queryByText('Pizza Palace')).not.toBeInTheDocument();
      expect(screen.getByText('Sushi Station')).toBeInTheDocument();
    });
  });

  it('shows all restaurants when search is cleared', async () => {
    vi.mocked(restaurantsApi.list).mockResolvedValue({
      restaurants: [mockRestaurant, mockRestaurant2],
      total: 2,
    });
    render(<RestaurantsPage />, { wrapper: ListWrapper });
    await waitFor(() => screen.getByText('Pizza Palace'));

    const input = screen.getByRole('searchbox', { name: /search restaurants/i });
    fireEvent.change(input, { target: { value: 'sushi' } });
    await waitFor(() => expect(screen.queryByText('Pizza Palace')).not.toBeInTheDocument());

    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByText('Pizza Palace')).toBeInTheDocument();
      expect(screen.getByText('Sushi Station')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// RestaurantDetailRoute — additional coverage
// ---------------------------------------------------------------------------

describe('RestaurantDetailRoute — missing id redirect', () => {
  it('redirects to /restaurants when id param is missing', () => {
    render(
      <MemoryRouter initialEntries={['/restaurants/']}>
        <QueryClientProvider client={makeQC()}>
          <Routes>
            <Route path="/restaurants/" element={<RestaurantDetailRoute />} />
            <Route path="/restaurants" element={<div>Restaurants List</div>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
    // With no :id segment the component calls navigate() and returns null
    expect(mockNavigate).toHaveBeenCalledWith('/restaurants', { replace: true });
  });
});

describe('RestaurantDetailRoute — edit modal', () => {
  it('opens edit modal with pre-filled values', async () => {
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.click(screen.getByRole('button', { name: /edit restaurant/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pizza Palace')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Italian')).toBeInTheDocument();
    expect(screen.getByDisplayValue('123 Main St')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Great thin crust')).toBeInTheDocument();
  });

  it('closes edit modal via X button', async () => {
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.click(screen.getByRole('button', { name: /edit restaurant/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits edit form and closes modal on success', async () => {
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    vi.mocked(restaurantsApi.update).mockResolvedValue({
      ...mockRestaurant,
      name: 'Pizza Palace Updated',
    });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.click(screen.getByRole('button', { name: /edit restaurant/i }));
    fireEvent.change(screen.getByDisplayValue('Pizza Palace'), {
      target: { value: 'Pizza Palace Updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(restaurantsApi.update).toHaveBeenCalledWith('r-1', {
        name: 'Pizza Palace Updated',
        cuisineType: 'Italian',
        location: '123 Main St',
        notes: 'Great thin crust',
      });
    });
  });

  it('shows error toast when update mutation fails', async () => {
    const { toast } = await import('sonner');
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    vi.mocked(restaurantsApi.update).mockRejectedValue(new Error('Update failed'));
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.click(screen.getByRole('button', { name: /edit restaurant/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update restaurant');
    });
  });
});

describe('RestaurantDetailRoute — archive / restore', () => {
  it('calls archive mutation and navigates on success for active restaurant', async () => {
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    vi.mocked(restaurantsApi.update).mockResolvedValue({ ...mockRestaurant, archived: true });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.click(screen.getByRole('button', { name: /archive restaurant/i }));

    await waitFor(() => {
      expect(restaurantsApi.update).toHaveBeenCalledWith('r-1', { archived: true });
      expect(mockNavigate).toHaveBeenCalledWith('/restaurants');
    });
  });

  it('shows restore button for archived restaurant', async () => {
    const archivedRestaurant = { ...mockRestaurant, archived: true };
    vi.mocked(restaurantsApi.get).mockResolvedValue(archivedRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Pizza Palace'));

    expect(screen.getByRole('button', { name: /restore restaurant/i })).toBeInTheDocument();
  });

  it('calls restore mutation for archived restaurant', async () => {
    const { toast } = await import('sonner');
    const archivedRestaurant = { ...mockRestaurant, archived: true };
    vi.mocked(restaurantsApi.get).mockResolvedValue(archivedRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    vi.mocked(restaurantsApi.update).mockResolvedValue({ ...mockRestaurant, archived: false });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.click(screen.getByRole('button', { name: /restore restaurant/i }));

    await waitFor(() => {
      expect(restaurantsApi.update).toHaveBeenCalledWith('r-1', { archived: false });
      expect(toast.success).toHaveBeenCalledWith('Restaurant restored');
    });
  });

  it('shows error toast when archive mutation fails', async () => {
    const { toast } = await import('sonner');
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    vi.mocked(restaurantsApi.update).mockRejectedValue(new Error('Archive failed'));
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Pizza Palace'));

    fireEvent.click(screen.getByRole('button', { name: /archive restaurant/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update restaurant');
    });
  });
});

describe('RestaurantDetailRoute — dishes', () => {
  it('shows dishes loading skeleton while fetching dishes', async () => {
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockReturnValue(new Promise(() => {}));
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Pizza Palace'));
    // Should show skeleton for dishes section while loading
    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
  });

  it('renders dish with null rating showing no-rating indicator', async () => {
    const dishNoRating = { ...mockDish, averageRating: null, ratingCount: 0 };
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [dishNoRating] });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Margherita Pizza'));
    expect(screen.getByText('No ratings')).toBeInTheDocument();
  });

  it('renders multiple dishes with ratings', async () => {
    const dish2 = {
      ...mockDish,
      id: 'rd-2',
      name: 'Garlic Bread',
      notes: null,
      averageRating: 3.8,
      ratingCount: 2,
    };
    vi.mocked(restaurantsApi.get).mockResolvedValue(mockRestaurant);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [mockDish, dish2] });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => {
      expect(screen.getByText('Margherita Pizza')).toBeInTheDocument();
      expect(screen.getByText('Garlic Bread')).toBeInTheDocument();
      expect(screen.getByText('4.5')).toBeInTheDocument();
      expect(screen.getByText('3.8')).toBeInTheDocument();
    });
  });
});

describe('RestaurantDetailRoute — stats and formatDate', () => {
  it('shows Never for null lastVisitedAt', async () => {
    const neverVisited = { ...mockRestaurant, lastVisitedAt: null, visitCount: 0 };
    vi.mocked(restaurantsApi.get).mockResolvedValue(neverVisited);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Never'));
  });

  it('shows em-dash for null averageRating in stats', async () => {
    const noRating = { ...mockRestaurant, averageRating: null };
    vi.mocked(restaurantsApi.get).mockResolvedValue(noRating);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('—'));
  });

  it('shows singular Visit label for visit count of 1', async () => {
    const oneVisit = { ...mockRestaurant, visitCount: 1 };
    vi.mocked(restaurantsApi.get).mockResolvedValue(oneVisit);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => {
      expect(screen.getByText('Visit')).toBeInTheDocument();
    });
  });

  it('does not render notes section when notes is null', async () => {
    const noNotes = { ...mockRestaurant, notes: null };
    vi.mocked(restaurantsApi.get).mockResolvedValue(noNotes);
    vi.mocked(restaurantsApi.listDishes).mockResolvedValue({ dishes: [] });
    render(<DetailWrapper id="r-1" />);
    await waitFor(() => screen.getByText('Pizza Palace'));
    expect(screen.queryByText('Great thin crust')).not.toBeInTheDocument();
  });
});
