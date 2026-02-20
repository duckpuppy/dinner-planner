import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { photos as photosApi, type Photo } from '@/lib/api';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth';

interface PreparationPhotosProps {
  preparationId: string;
}

export function PreparationPhotos({ preparationId }: PreparationPhotosProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ['photos', preparationId],
    queryFn: () => photosApi.list(preparationId),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => photosApi.upload(preparationId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos', preparationId] });
    },
    onError: () => toast.error('Failed to upload photo'),
  });

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => photosApi.delete(photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos', preparationId] });
    },
    onError: () => toast.error('Failed to delete photo'),
  });

  const photoList: Photo[] = data?.photos ?? [];

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    e.target.value = '';
  }

  function canDelete(photo: Photo): boolean {
    if (!user) return false;
    return user.role === 'admin' || photo.uploadedById === user.id;
  }

  return (
    <div className="mt-2">
      {photoList.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {photoList.map((photo) => (
            <div key={photo.id} className="relative group">
              <img
                src={photo.url}
                alt="Preparation photo"
                className="h-20 w-20 object-cover rounded-md border"
              />
              {canDelete(photo) && (
                <button
                  onClick={() => deleteMutation.mutate(photo.id)}
                  disabled={deleteMutation.isPending}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 text-white rounded
                             opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Delete photo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground
                   border border-dashed rounded px-2 py-1 hover:bg-muted transition-colors"
      >
        {uploadMutation.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ImagePlus className="h-3 w-3" />
        )}
        {uploadMutation.isPending ? 'Uploading…' : 'Add photo'}
      </button>
    </div>
  );
}
