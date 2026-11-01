// 必填標記（DESIGN.md §6「表單必填」）：標籤後面加「＊」，報讀器念「必填」
import s from "./required.module.css";

export default function Required() {
  return (
    <>
      <span className={s.star} aria-hidden="true">＊</span>
      <span className="sr">（必填）</span>
    </>
  );
}
