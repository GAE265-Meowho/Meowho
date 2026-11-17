// 小遊戲的操作說明（#456，渝茜）：手機（手指）和電腦（滑鼠、鍵盤）講的不一樣，文字集中在這個檔案，依裝置挑一種。
// 框架由渝茜搭；各小遊戲負責人（珮瑜、Tina、世安）要改自己遊戲的手機版文字，直接改下面對應那一項的 touch 即可，不用動元件。
// 沒寫 touch 的就用 desktop 的文字。純函式，有測試。
export interface ControlText {
  /** 電腦：滑鼠、鍵盤 */
  desktop: string;
  /** 手機、平板：手指 */
  touch?: string;
}

/** 依裝置挑文字；touch＝這個裝置主要用手指（pointer: coarse） */
export const controlText = (t: ControlText, touch: boolean): string => (touch ? t.touch ?? t.desktop : t.desktop);

/** 每個小遊戲的操作說明。第 1 份（珮瑜）：scoop、feed、water；第 2 份（Tina）：nail；第 3 份（世安）：pet、brush */
export const CONTROL_TEXT = {
  scoop: {
    desktop: "按住滑鼠左鍵拖曳貓砂鏟，慢慢鏟起大便和結塊，左右甩一甩把砂子甩掉，再拿到左邊的垃圾袋上方放開。動作太大會掉回去。",
    touch: "用手指按住畫面拖曳貓砂鏟，慢慢鏟起大便和結塊，左右甩一甩把砂子甩掉，再拿到左邊的垃圾袋上方放開。動作太大會掉回去。",
  },
  feedDry: {
    desktop: "用滑鼠按住「倒乾飼料」，倒到建議份量就放開。",
    touch: "用手指按住「倒乾飼料」，倒到建議份量就放開。",
  },
  feedWet: {
    desktop: "用滑鼠點「開一罐」倒進碗裡，不夠可以再開一罐。",
    touch: "點一下「開一罐」倒進碗裡，不夠可以再開一罐。",
  },
  waterWash: {
    desktop: "按住滑鼠左鍵在碗裡拖曳，用菜瓜布畫圈或來回把水垢搓掉。",
    touch: "用手指在碗裡拖曳，用菜瓜布畫圈或來回把水垢搓掉。",
  },
  waterTap: {
    desktop: "用滑鼠按住「開水龍頭」。",
    touch: "用手指按住「開水龍頭」。",
  },
  nail: {
    desktop: "點一下肉球固定（或按住空白鍵），指甲才會伸出來；滑鼠移到白色尖端按一下就剪。粉紅色是血線，剪到會流血。",
    touch: "一根手指按住肉球，指甲才會伸出來；另一根手指把指甲刀拖到白色尖端，放開就剪。粉紅色是血線，剪到會流血。",
  },
  petIntro: {
    desktop: "按住滑鼠左鍵輕輕撫摸，觀察牠是否想繼續。",
    touch: "用手指輕輕撫摸，觀察牠是否想繼續。",
  },
  petView: {
    desktop: "用左下角的搖桿（或鍵盤方向鍵）轉動視角。可先輕摸頭或下巴。",
    touch: "用左下角的搖桿轉動視角。可先輕摸頭或下巴。",
  },
} as const satisfies Record<string, ControlText>;
