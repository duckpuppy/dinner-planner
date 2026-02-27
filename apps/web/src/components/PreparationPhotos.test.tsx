import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PreparationPhotos } from './PreparationPhotos';

const { mockUser } = vi.hoisted(() => ({
  mockUser: { id: 'user-1', username: 'alice', displayName: 'Alice', role: 'user' as const },
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn((selector: (s: { user: typeof mockUser }) => unknown) =>
    selector({ user: mockUser })
  ),
}));

vi.mock('@/lib/api', () => ({
  photos: {
    list: vi.fn(),
    upload: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { photos as photosApi } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PreparationPhotos', () => {
  it('renders Add photo button', async () => {
    vi.mocked(photosApi.list).mockResolvedValue({ photos: [] });
    render(<PreparationPhotos preparationId="prep-1" />, { wrapper });
    expect(await screen.findByText('Add photo')).toBeTruthy();
  });

  it('renders photos when photos exist', async () => {
    vi.mocked(photosApi.list).mockResolvedValue({
      photos: [
        {
          id: 'photo-1',
          url: '/uploads/photo1.jpg',
          uploadedById: 'user-1',
          preparationId: 'prep-1',
          createdAt: '',
        },
      ],
    });
    render(<PreparationPhotos preparationId="prep-1" />, { wrapper });
    const img = await screen.findByAltText('Preparation photo');
    expect(img).toBeTruthy();
    expect((img as HTMLImageElement).src).toContain('photo1.jpg');
  });

  it('shows delete button for own photos', async () => {
    vi.mocked(photosApi.list).mockResolvedValue({
      photos: [
        {
          id: 'photo-1',
          url: '/uploads/photo1.jpg',
          uploadedById: 'user-1', // same as mockUser.id
          preparationId: 'prep-1',
          createdAt: '',
        },
      ],
    });
    render(<PreparationPhotos preparationId="prep-1" />, { wrapper });
    expect(await screen.findByRole('button', { name: 'Delete photo' })).toBeTruthy();
  });

  it('does not show delete button for other users photos (non-admin)', async () => {
    vi.mocked(photosApi.list).mockResolvedValue({
      photos: [
        {
          id: 'photo-1',
          url: '/uploads/photo1.jpg',
          uploadedById: 'other-user', // different user
          preparationId: 'prep-1',
          createdAt: '',
        },
      ],
    });
    render(<PreparationPhotos preparationId="prep-1" />, { wrapper });
    await screen.findByAltText('Preparation photo');
    expect(screen.queryByRole('button', { name: 'Delete photo' })).toBeNull();
  });

  it('calls photos.delete when delete button clicked', async () => {
    vi.mocked(photosApi.list).mockResolvedValue({
      photos: [
        {
          id: 'photo-1',
          url: '/uploads/photo1.jpg',
          uploadedById: 'user-1',
          preparationId: 'prep-1',
          createdAt: '',
        },
      ],
    });
    vi.mocked(photosApi.delete).mockResolvedValue(undefined as never);

    render(<PreparationPhotos preparationId="prep-1" />, { wrapper });
    const deleteBtn = await screen.findByRole('button', { name: 'Delete photo' });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(photosApi.delete).toHaveBeenCalledWith('photo-1');
    });
  });

  it('shows delete button for admin user for any photo', async () => {
    const { useAuthStore } = await import('@/stores/auth');
    const adminUser = {
      id: 'admin-1',
      username: 'admin',
      displayName: 'Admin',
      role: 'admin' as const,
    };
    vi.mocked(useAuthStore).mockImplementation(
      (selector: (s: { user: typeof adminUser }) => unknown) => selector({ user: adminUser })
    );

    vi.mocked(photosApi.list).mockResolvedValue({
      photos: [
        {
          id: 'photo-1',
          url: '/uploads/photo1.jpg',
          uploadedById: 'other-user',
          preparationId: 'prep-1',
          createdAt: '',
        },
      ],
    });
    render(<PreparationPhotos preparationId="prep-1" />, { wrapper });
    expect(await screen.findByRole('button', { name: 'Delete photo' })).toBeTruthy();
  });

  it('calls photos.upload when file is selected via file input', async () => {
    vi.mocked(photosApi.list).mockResolvedValue({ photos: [] });
    vi.mocked(photosApi.upload).mockResolvedValue({
      photo: {
        id: 'p-1',
        url: '/x.jpg',
        uploadedById: 'user-1',
        preparationId: 'prep-1',
        createdAt: '',
      },
    } as never);
    render(<PreparationPhotos preparationId="prep-1" />, { wrapper });
    await screen.findByText('Add photo');

    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(photosApi.upload).toHaveBeenCalledWith('prep-1', file);
    });
  });

  it('does not upload when no file is selected', async () => {
    vi.mocked(photosApi.list).mockResolvedValue({ photos: [] });
    render(<PreparationPhotos preparationId="prep-1" />, { wrapper });
    await screen.findByText('Add photo');

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [] } });

    expect(photosApi.upload).not.toHaveBeenCalled();
  });
});
