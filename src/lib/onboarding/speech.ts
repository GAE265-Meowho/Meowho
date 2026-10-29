// 語音輸入（瀏覽器內建 SpeechRecognition）的錯誤訊息：依失敗原因告訴使用者怎麼做（FR-03-05）。
export function micErrorMessage(reason: string | undefined): string {
  switch (reason) {
    case "not-allowed":
    case "service-not-allowed":
      return "麥克風權限被關閉了：請在瀏覽器網址列左邊的鎖頭／設定中允許「麥克風」，或改用打字";
    case "audio-capture":
      return "找不到麥克風，請確認裝置有接上麥克風，或改用打字";
    case "no-speech":
      return "沒有聽到聲音，請靠近麥克風再試一次，或改用打字";
    case "network":
      return "語音辨識需要網路連線（由瀏覽器提供），目前連不上，請稍後再試或改用打字";
    case "language-not-supported":
      return "這個瀏覽器不支援中文語音辨識，請改用打字";
    case "aborted":
      return "";
    default:
      return "語音輸入暫時無法使用，請改用打字";
  }
}

export const MIC_UNSUPPORTED = "這個瀏覽器不支援語音輸入（LINE、Facebook 內建瀏覽器常見），請改用 Chrome／Safari 開啟，或直接打字";
