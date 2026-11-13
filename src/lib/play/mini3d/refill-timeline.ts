/** 換水特寫的六格動作（第一視角：右手拿水碗、左手開水龍頭）。只算每個時間點的數值，不碰 3D。 */

export const REFILL_STEPS = [
  { id: "approach", label: "拿著舊水碗到水槽前", seconds: 1.2 },
  { id: "pour", label: "倒掉舊水", seconds: 2.2 },
  { id: "under", label: "空碗移到出水口下", seconds: 1.0 },
  { id: "reach", label: "左手握住把手", seconds: 1.0 },
  { id: "fill", label: "抬起把手，接新水", seconds: 2.6 },
  { id: "close", label: "關水，端走", seconds: 1.6 },
] as const;

export const REFILL_SECONDS = REFILL_STEPS.reduce((sum, s) => sum + s.seconds, 0);
/** 一開始碗裡的舊水、最後接到的新水（0～1 的水位）；新水換成 fill 是 80，過 careGood 的 70 */
export const OLD_WATER = 0.5;
export const NEW_WATER = 0.8;

export type RefillFrame = {
  /** 第幾格（0 起算） */
  step: number;
  /** 右手進到水槽前的程度 0～1 */
  near: number;
  /** 碗在出水口下的程度 0～1（0 是在水槽前方） */
  under: number;
  /** 碗傾倒的程度 0～1 */
  tilt: number;
  /** 碗裡的水位 0～1 */
  water: number;
  /** 碗裡是舊水 */
  dirty: boolean;
  /** 舊水正在往外流 */
  pouring: boolean;
  /** 右手手勢：托住或握碗緣 */
  rightPose: "cradle" | "rim";
  /** 左手伸到把手上的程度 0～1 */
  leftReach: number;
  /** 水龍頭開的程度 0～1 */
  open: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0→1 的平滑過渡，a 之前是 0、b 之後是 1 */
const ease = (x: number, a = 0, b = 1) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

export function refillAt(seconds: number): RefillFrame {
  let t = Math.min(Math.max(seconds, 0), REFILL_SECONDS);
  let step = 0;
  while (step < REFILL_STEPS.length - 1 && t >= REFILL_STEPS[step].seconds) t -= REFILL_STEPS[step++].seconds;
  const k = clamp01(t / REFILL_STEPS[step].seconds);

  const frame: RefillFrame = {
    step, near: 1, under: step >= 3 ? 1 : 0, tilt: 0, water: 0, dirty: false, pouring: false,
    rightPose: "cradle", leftReach: step === 4 ? 1 : 0, open: 0,
  };
  switch (REFILL_STEPS[step].id) {
    case "approach":
      Object.assign(frame, { near: ease(k), water: OLD_WATER, dirty: true });
      break;
    case "pour": {
      // 先傾斜、水流光、再扶正
      const tilt = ease(k, 0, 0.3) * (1 - ease(k, 0.75, 1));
      const water = OLD_WATER * (1 - ease(k, 0.25, 0.7));
      Object.assign(frame, { tilt, water, dirty: true, pouring: water > 0.01 && tilt > 0.6, rightPose: "rim" });
      break;
    }
    case "under":
      frame.under = ease(k);
      break;
    case "reach":
      frame.leftReach = ease(k);
      break;
    case "fill":
      Object.assign(frame, { open: ease(k, 0, 0.15), water: NEW_WATER * clamp01((k - 0.1) / 0.8) });
      break;
    case "close":
      Object.assign(frame, { open: 1 - ease(k, 0, 0.25), leftReach: 1 - ease(k, 0.3, 0.8), under: 1 - ease(k, 0.4, 1), water: NEW_WATER });
      break;
  }
  return frame;
}

/** 遊戲裡自動播的前三格（拿碗、倒舊水、移到出水口下）共幾秒；之後換玩家按住開水 */
export const REFILL_INTRO_SECONDS = REFILL_STEPS.slice(0, 3).reduce((sum, s) => sum + s.seconds, 0);

/** 左手伸到把手要幾秒、把手抬到全開要幾秒 */
const REACH_SECONDS = 0.35, OPEN_SECONDS = 0.25;
const toward = (now: number, goal: number, step: number) => (now < goal ? Math.min(goal, now + step) : Math.max(goal, now - step));

/**
 * 玩家按住／放開時，左手和水龍頭下一刻的狀態。
 * 按住：左手先握到把手，再抬起把手；放開：先壓下把手關水，左手才離開。
 */
export function refillHold(now: { leftReach: number; open: number }, holding: boolean, dt: number): { leftReach: number; open: number } {
  const step = Math.min(Math.max(dt, 0), 0.1);
  const open = toward(now.open, holding && now.leftReach >= 1 ? 1 : 0, step / OPEN_SECONDS);
  const leftReach = toward(now.leftReach, holding || open > 0 ? 1 : 0, step / REACH_SECONDS);
  return { leftReach, open };
}

/** 玩家操作階段的畫面：碗固定在出水口下，水位照 fill（0～100，超過算滿） */
export function refillPlayFrame(hold: { leftReach: number; open: number }, fill: number): RefillFrame {
  return {
    step: hold.open > 0 ? 4 : 3, near: 1, under: 1, tilt: 0, water: clamp01(fill / 100), dirty: false, pouring: false,
    rightPose: "cradle", leftReach: hold.leftReach, open: hold.open,
  };
}
