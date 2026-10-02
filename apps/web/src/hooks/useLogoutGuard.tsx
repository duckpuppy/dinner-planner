import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useFailedSyncCount, usePendingSyncCount } from '@/lib/syncStatus';

/**
 * Signing out clears the persisted offline queue, so a user-initiated logout with unsynced
 * (pending or failed) changes asks first. Render `dialog` next to the sign-out button and call
 * `requestLogout` from its onClick.
 */
export function useLogoutGuard(logout: () => void | Promise<void>): {
  requestLogout: () => void;
  dialog: ReactNode;
} {
  const unsynced = usePendingSyncCount() + useFailedSyncCount();
  const [open, setOpen] = useState(false);

  const requestLogout = () => {
    if (unsynced > 0) setOpen(true);
    else void logout();
  };

  const dialog = (
    <ConfirmDialog
      open={open && unsynced > 0}
      title="Sign out with unsynced changes?"
      description={`You have ${unsynced} unsynced ${unsynced === 1 ? 'change' : 'changes'}. Signing out will discard ${unsynced === 1 ? 'it' : 'them'}.`}
      confirmText="Sign out anyway"
      variant="destructive"
      onConfirm={() => {
        setOpen(false);
        void logout();
      }}
      onCancel={() => setOpen(false)}
    />
  );

  return { requestLogout, dialog };
}
