import { useCallback, useSyncExternalStore } from "react";
import { sound, type SoundName } from "./engine";

/** Subscribe to the mute state. */
export function useSoundEnabled() {
  return useSyncExternalStore(
    (fn) => sound.subscribe(fn),
    () => sound.enabled,
    () => false, // SSR / first paint: silent
  );
}

/** `const play = useSound(); play("press")` */
export function useSound() {
  return useCallback((name: SoundName, depth?: number) => {
    sound.play(name, depth);
  }, []);
}

export { sound };
export type { SoundName };
