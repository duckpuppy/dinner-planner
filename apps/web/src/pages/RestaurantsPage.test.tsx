import { describe, it, expect, vi, afterEach } from 'vitest';
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
