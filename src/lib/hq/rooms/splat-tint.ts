// 掃描房間（Gaussian Splat）整體調色（#354 白天／夜晚光）：在函式庫的片段著色器最後把輸出顏色乘上 uTint。
// 只改著色器文字（純函式，可測）；套到材質上在 RoomViewer。白天 uTint＝(1,1,1)，乘完和原本一模一樣。
export const TINT_UNIFORM = "uTint";
const MARK = "/* meow-tint */";

/** 已經改過就原樣回傳（不會重複插入）；找不到 main 的結尾也原樣回傳 */
export function tintFragment(src: string): string {
  if (src.includes(MARK)) return src;
  const end = src.lastIndexOf("}");
  if (end < 0 || !src.includes("gl_FragColor")) return src;
  return `uniform vec3 ${TINT_UNIFORM}; ${MARK}\n${src.slice(0, end)}    gl_FragColor.rgb *= ${TINT_UNIFORM};\n${src.slice(end)}`;
}

export const isTinted = (src: string) => src.includes(MARK);
