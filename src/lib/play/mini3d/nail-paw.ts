/** 剪指甲底圖（public/play/nail/paw-tabby.webp，AI 合成的虎斑小貓腳掌）上的位置，單位是 viewBox 320×320。
 *  照片只負責看起來真實；指甲、血、指甲刀都是程式疊上去的，靠這裡的座標對位。換照片要重量這張表。 */
export const PAW_PHOTO = { src: "/play/nail/paw-tabby.webp", size: 320 } as const;
/** 指甲伸出來的長度、指甲刀左右對準的容許寬度 */
export const CLAW_LEN = 54, CLAW_AIM = 15;

/** 四根腳趾（左到右）：pad＝趾肉球中心（按這裡）、base＝指甲從毛裡伸出來的位置、angle＝指甲方向（度，0＝朝正上方，正值往右斜） */
export const PAW_TOES = [
  { pad: { x: 87, y: 194 }, base: { x: 73, y: 144 }, angle: -24 },
  { pad: { x: 135, y: 139 }, base: { x: 133, y: 91 }, angle: -6 },
  { pad: { x: 192, y: 137 }, base: { x: 190, y: 87 }, angle: 6 },
  { pad: { x: 235, y: 187 }, base: { x: 251, y: 142 }, angle: 24 },
] as const;

/** 畫面上的一點換成某根指甲自己的座標：along＝沿指甲方向離根部多遠、side＝偏左右多少 */
function onClaw(toe: number, x: number, y: number) {
  const t = PAW_TOES[toe], a = t.angle * Math.PI / 180, dx = x - t.base.x, dy = y - t.base.y;
  return { along: dx * Math.sin(a) - dy * Math.cos(a), side: dx * Math.cos(a) + dy * Math.sin(a) };
}

/** 指甲刀的刀口對到哪一根、剪在哪裡（0＝尖端、1＝根部）；沒對到 toe 是 null */
export function aimAt(x: number, y: number): { toe: number | null; depth: number } {
  for (let toe = 0; toe < PAW_TOES.length; toe++) {
    const p = onClaw(toe, x, y);
    if (Math.abs(p.side) <= CLAW_AIM && p.along >= -4 && p.along <= CLAW_LEN + 8) {
      return { toe, depth: Math.min(1, Math.max(0, 1 - p.along / CLAW_LEN)) };
    }
  }
  return { toe: null, depth: 0 };
}

/** 某根指甲上深度 depth 的那一點在畫面的哪裡（測試與自動操作用） */
export function clawPoint(toe: number, depth: number): { x: number; y: number } {
  const t = PAW_TOES[toe], a = t.angle * Math.PI / 180, along = CLAW_LEN * (1 - depth);
  return { x: t.base.x + along * Math.sin(a), y: t.base.y - along * Math.cos(a) };
}
