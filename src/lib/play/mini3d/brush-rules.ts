export interface BrushInput {
  dt: number;
  holding: boolean;
  target: number | null;
  travel: number;
  near: boolean;
}

const phases = ["touch", "lift", "paste", "finger", "brush"] as const;

export function brushDifficulty(trust: number, stress: number, level: number) {
  const calm = (Math.max(0, Math.min(100, trust)) + 100 - Math.max(0, Math.min(100, stress))) / 200;
  const phase = phases[Math.max(0, Math.min(4, Math.floor(level)))] ?? "touch";
  return {
    phase,
    teeth: phase === "brush" ? 6 : phase === "finger" ? 4 : 0,
    patience: 27 + 33 * calm,
    struggleEvery: 4 + 10 * calm,
    biteAfter: 0.45 + 0.6 * calm,
  };
}

type Difficulty = ReturnType<typeof brushDifficulty>;
export type BrushResult = { bitten: boolean; ran: boolean; score: number };
export type BrushState = {
  elapsed: number;
  pressure: number;
  practice: number;
  clean: number[];
  result: BrushResult | null;
};

export function newBrush(config: Difficulty): BrushState {
  return { elapsed: 0, pressure: 0, practice: 0, clean: Array(config.teeth).fill(0), result: null };
}

export function brushStruggling(elapsed: number, config: Difficulty) {
  return elapsed >= config.struggleEvery && elapsed % config.struggleEvery < 1.2;
}

export function brushScore(state: BrushState) {
  const fraction = state.clean.length
    ? state.clean.reduce((sum, value) => sum + value, 0) / state.clean.length
    : state.practice;
  return Math.floor(fraction * 100);
}

export function brushStep(state: BrushState, config: Difficulty, input: BrushInput): BrushState {
  if (state.result) return state;
  const dt = Math.min(0.1, Math.max(0, input.dt));
  const elapsed = state.elapsed + dt;
  const struggling = brushStruggling(elapsed, config);
  const pressure = struggling && input.holding ? state.pressure + dt : 0;
  let { practice, clean } = state;
  if (!struggling) {
    if (config.teeth && input.holding && input.target !== null && input.travel > 0) {
      const target = input.target;
      clean = clean.map((value, index) => index === target ? Math.min(1, value + Math.min(input.travel, 0.08) * 3) : value);
    } else if (!config.teeth) {
      const practicing = config.phase === "paste"
        ? input.near && input.travel < 0.02
        : input.holding && input.near;
      if (practicing) practice = Math.min(1, practice + dt / (config.phase === "touch" ? 6 : 4.5));
    }
  }
  const next = { elapsed, pressure, practice, clean, result: null };
  const bitten = pressure >= config.biteAfter;
  const ran = !bitten && elapsed >= config.patience;
  const score = brushScore(next);
  return bitten || ran || score === 100 ? { ...next, result: { bitten, ran, score } } : next;
}

type Pointers = { lip: number | null; tool: number | null };
export function brushPointers(pointers: Pointers, id: number, action: keyof Pointers | "release"): Pointers {
  if (action === "release") {
    return { lip: pointers.lip === id ? null : pointers.lip, tool: pointers.tool === id ? null : pointers.tool };
  }
  if (pointers[action] !== null || pointers.lip === id || pointers.tool === id) return pointers;
  return { ...pointers, [action]: id };
}
