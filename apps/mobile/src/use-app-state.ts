import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Fires on every transition.
 *
 * Typical use:
 *   - On foreground (active): refresh stale data, reconnect socket if needed.
 *   - On background (background/inactive): persist any in-flight state, disconnect socket politely.
 */
export function useAppState(handler: (next: AppStateStatus, prev: AppStateStatus) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let prev = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      handlerRef.current(next, prev);
      prev = next;
    });
    return () => sub.remove();
  }, []);
}
