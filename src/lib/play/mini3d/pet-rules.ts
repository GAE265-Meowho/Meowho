/** Pure, deterministic interaction rules for the 3D petting mini-game (#356).
 * Rendering, raycasting and animation are intentionally outside this module.
 */
export type PetZone = "head" | "chin" | "back" | "belly" | "tail" | null;
export type PetFavorite = "head" | "chin" | "back";

export interface PetState {
  fun: number;
  annoyance: number;
  ran: boolean;
}

export interface PetStroke {
  zone: PetZone;
  /** Distance traveled on screen since the previous sample, in CSS pixels. */
  distancePx: number;
  /** Elapsed time since the previous sample, in seconds. */
  dt: number;
  touching: boolean;
  favorite: PetFavorite | null;
  /** 0..100, from current game state, not the cat's artwork. */
  trust: number;
  stress: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const newPetState = (): PetState => ({ fun: 0, annoyance: 0, ran: false });

/** Update only from real pointer samples. A release stops negative contact immediately. */
export function petStroke(state: PetState, input: PetStroke): PetState {
  if (state.ran) return state;
  const dt = clamp(Number.isFinite(input.dt) ? input.dt : 0, 0, 0.1);
  const distance = clamp(Number.isFinite(input.distancePx) ? input.distancePx : 0, 0, 120);
  const trust = clamp(input.trust, 0, 100);
  const stress = clamp(input.stress, 0, 100);
  let fun = state.fun;
  let annoyance = state.annoyance;

  if (!input.touching || !input.zone) {
    annoyance = Math.max(0, annoyance - 8 * dt);
  } else if (input.zone === "belly" || input.zone === "tail") {
    annoyance += (45 * dt + distance * 0.12) * (1 + stress / 400);
    fun -= distance * 0.03;
  } else if (dt > 0 && distance / dt > 420) {
    // Fast strokes annoy the cat instead of producing hearts.
    annoyance += 40 * dt + distance * 0.08;
  } else {
    const favoriteFactor = input.favorite && input.zone === input.favorite ? 2 : 1;
    const moodFactor = (0.9 + trust / 1000) * (1 - stress / 400);
    fun += distance * 0.05 * favoriteFactor * moodFactor;
    annoyance -= 6 * dt;
  }

  fun = clamp(fun, 0, 100);
  annoyance = clamp(annoyance, 0, 100);
  return { fun, annoyance, ran: annoyance >= 100 };
}

/** The existing careGood('pet', result) consumes exactly ran and fun. */
export function petResult(state: PetState): { ran: boolean; fun: number } {
  return { ran: state.ran, fun: Math.round(clamp(state.fun, 0, 100)) };
}
