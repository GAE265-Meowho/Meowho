// 掃描房間整體調色（#354 白天／夜晚光）：在片段著色器最後把輸出顏色乘上一個 vec3 uniform。
// 只改著色器文字（純函式，可測）；套到材質上在 RoomViewer。白天 uniform＝(1,1,1)，乘完和原本一模一樣。
//   - Splat（函式庫的 ShaderMaterial）：uTint
//   - 虛擬物件（three.js 內建材質，用 onBeforeCompile）：用品、玩具同樣是 uTint（和房間一樣暗）；貓是 uCatTint（亮一點，看得清楚）
// 乘在 main 的最後：three.js 內建材質已經轉成螢幕色彩空間（colorspace_fragment），和 Splat 的輸出同一個空間，所以同一個 tint 暗得一樣。
export const TINT_UNIFORM = "uTint";
export const CAT_TINT_UNIFORM = "uCatTint";
const MARK = "/* meow-tint */";

/**
 * 在 main 最後乘上 uniform。已經改過就原樣回傳（不會重複插入）；看不懂的著色器原樣回傳。
 * requireFragColor：Splat 的著色器文字裡一定有 gl_FragColor；three.js 內建材質在 onBeforeCompile 時還是 #include，要傳 false。
 */
export function tintFragment(src: string, uniform = TINT_UNIFORM, requireFragColor = true): string {
  if (src.includes(MARK)) return src;
  const end = src.lastIndexOf("}");
  if (end < 0 || !src.includes("main") || (requireFragColor && !src.includes("gl_FragColor"))) return src;
  return `uniform vec3 ${uniform}; ${MARK}\n${src.slice(0, end)}    gl_FragColor.rgb *= ${uniform};\n${src.slice(end)}`;
}

export const isTinted = (src: string) => src.includes(MARK);
