"use client";

import { useState, useSyncExternalStore } from "react";
import CatButton from "@/components/ui/CatButton";
import { EarTop } from "@/components/ui/Edges";
import Icon, { type IconName } from "@/components/ui/Icon";
import SectionHead from "../SectionHead";
import shared from "../section.module.css";
import styles from "./trial.module.css";

// 首頁只放三個小遊戲的示範影片（子哲 2026-11-16）：按鈕切換餵飯、鏟屎、摸摸，不讓訪客在首頁玩。
// 影片在 public/home/trial/<id>.mp4：只有 3D 遊戲畫面（不含標題、說明、計量條），2 倍解析度錄、960×720。
// 錄法同小遊戲示範（docs/play-tasks/guide-videos.md），差別是只截 3D 畫布、隱藏摸貓的視角按鈕；小遊戲開場示範仍用 public/play/guide/。
type Demo = { id: "feed" | "scoop" | "pet"; icon: IconName; title: string; note: string };

const demos: Demo[] = [
  { id: "feed", icon: "bowl", title: "餵飯", note: "選一種飼料，倒出剛好的一餐。" },
  { id: "scoop", icon: "check", title: "鏟屎", note: "連砂鏟起、甩三下，倒進垃圾袋。" },
  { id: "pet", icon: "heart", title: "摸摸", note: "找到牠喜歡被摸的地方，慢慢來。" },
];

const REDUCE = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(REDUCE);
      mq?.addEventListener("change", cb);
      return () => mq?.removeEventListener("change", cb);
    },
    () => Boolean(window.matchMedia?.(REDUCE).matches),
    () => false,
  );
}

/** CTA：回到上方 Hero 的搜尋列（TypeSearch 的 #match），並把游標放進輸入框 */
function backToSearch() {
  const form = document.getElementById("match");
  const reduce = window.matchMedia?.(REDUCE).matches;
  form?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  document.getElementById("match-input")?.focus({ preventScroll: true });
}

export default function Trial() {
  const [current, setCurrent] = useState<Demo["id"]>("feed");
  const still = useReducedMotion();
  const demo = demos.find((d) => d.id === current)!;
  const video = `/home/trial/${current}.mp4`;

  return (
    <section id="trial" className={shared.section} aria-labelledby="trial-title">
      <div className="wrap">
        <SectionHead
          id="trial-title"
          icon="yarn"
          kicker="3D 養貓中心｜領養任務"
          title={
            <>
              <span>先跟牠的虛擬分身</span>
              <span>在你家同居</span>
            </>
          }
          lead="點點看，每天的餵飯、鏟屎、摸摸都要你親手來。"
        />
      </div>

      <EarTop color="var(--yellow-soft)" />
      <div className={styles.panel}>
        <div className={`wrap ${styles.grid}`}>
          <div className={styles.tasks}>
            <ul className={styles.list}>
              {demos.map((d) => {
                const on = d.id === current;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={`${styles.task} ${on ? styles.taskOn : ""}`}
                      aria-pressed={on}
                      aria-controls="trial-video"
                      onClick={() => setCurrent(d.id)}
                    >
                      <span className={styles.taskIcon}>
                        <Icon name={d.icon} size={20} />
                      </span>
                      <span className={styles.taskBody}>
                        <span className={styles.taskTitle}>{d.title}</span>
                        <span className={styles.note}>{d.note}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className={styles.cta}>
              <CatButton onClick={backToSearch} arrow>
                開始我的領養任務
              </CatButton>
            </div>
          </div>

          <div className={styles.stage}>
            <video
              id="trial-video"
              key={video}
              className={styles.video}
              src={video}
              aria-label={`${demo.title}示範影片`}
              muted
              loop
              playsInline
              autoPlay={!still}
              controls={still}
              preload="metadata"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
