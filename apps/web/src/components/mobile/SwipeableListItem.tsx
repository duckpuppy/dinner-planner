import { ReactNode, useState, useRef, useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';
import { SwipeActions, type SwipeAction } from './SwipeActions';
import { useHaptic } from '@/hooks/useHaptic';
import { isMobileDevice, prefersReducedMotion } from '@/utils/mobile';

interface SwipeableListItemProps {
  children: ReactNode;
  actions: SwipeAction[];
  itemId: string;
  activeItemId: string | null;
  onSwipeStart: (itemId: string) => void;
  onSwipeEnd: () => void;
}

export function SwipeableListItem({
  children,
  actions,
  itemId,
  activeItemId,
  onSwipeStart,
  onSwipeEnd,
}: SwipeableListItemProps) {
  const { haptic } = useHaptic();
  const [offset, setOffset] = useState(0);
  const [actionsVisible, setActionsVisible] = useState(false);
  const hasTriggeredHaptic = useRef(false);
  const threshold = 80;

  const isDisabled = !isMobileDevice() || prefersReducedMotion();

  // Reset when another item becomes active
  useEffect(() => {
    if (activeItemId !== null && activeItemId !== itemId) {
      setOffset(0);
      setActionsVisible(false);
      hasTriggeredHaptic.current = false;
    }
  }, [activeItemId, itemId]);

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      if (isDisabled) return;
      if (eventData.dir === 'Left' && eventData.deltaX < 0) {
        const newOffset = Math.max(eventData.deltaX, -threshold - 20);
        setOffset(newOffset);

        // Trigger haptic feedback when crossing threshold
        if (newOffset <= -threshold && !hasTriggeredHaptic.current) {
          haptic.tap();
          hasTriggeredHaptic.current = true;
        }
      }
    },
    onSwiped: (eventData) => {
      if (isDisabled) return;
      if (eventData.dir === 'Left') {
        if (offset <= -threshold) {
          // Reveal actions
          setOffset(-threshold);
          setActionsVisible(true);
          onSwipeStart(itemId);
        } else {
          // Reset if didn't reach threshold
          setOffset(0);
          hasTriggeredHaptic.current = false;
        }
      } else if (eventData.dir === 'Right') {
        // Close on right swipe
        setOffset(0);
        setActionsVisible(false);
        onSwipeEnd();
        hasTriggeredHaptic.current = false;
      }
    },
    trackMouse: false,
    preventScrollOnSwipe: true,
    delta: 10,
  });

  const handleActionClick = async (action: SwipeAction) => {
    haptic.success();
    await action.onAction();
    setOffset(0);
    setActionsVisible(false);
    onSwipeEnd();
    hasTriggeredHaptic.current = false;
  };

  const wrappedActions = actions.map(action => ({
    ...action,
    onAction: () => handleActionClick(action),
  }));

  if (isDisabled) {
    return <div data-swipeable-item>{children}</div>;
  }

  return (
    <div
      data-swipeable-item
      className="relative overflow-hidden"
      style={{ touchAction: 'pan-y' }}
    >
      <div
        {...handlers}
        className="relative transition-transform duration-200"
        style={{
          transform: `translateX(${offset}px)`,
          willChange: 'transform',
        }}
      >
        {children}
      </div>
      <SwipeActions actions={wrappedActions} visible={actionsVisible} />
    </div>
  );
}
