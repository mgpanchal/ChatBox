import { useEffect, useState } from 'react';
import { session } from './session';

export type AuthState = {
  ready: boolean;
  signedIn: boolean;
};

export function useAuthState(): AuthState {
  const [signedIn, setSignedIn] = useState(session.isSignedIn());
  const [ready, setReady] = useState(session.isHydrated());

  useEffect(() => {
    if (!session.isHydrated()) {
      session.hydrate().then(() => {
        setSignedIn(session.isSignedIn());
        setReady(true);
      });
    } else {
      setReady(true);
    }
    return session.subscribe((s) => setSignedIn(s));
  }, []);

  return { ready, signedIn };
}
