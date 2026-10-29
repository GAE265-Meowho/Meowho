"use client";

import { useState } from "react";
import CatPerch from "@/components/journey/CatPerch";
import CatButton from "@/components/ui/CatButton";
import { EarTop } from "@/components/ui/Edges";
import Icon, { type IconName } from "@/components/ui/Icon";
import SectionHead from "../SectionHead";
import shared from "../section.module.css";
import styles from "./trial.module.css";

type Choice = { text: string; good: boolean; feedback: string };
type Task = { id: string; time: string; icon: IconName; title: string; note: string; choices?: Choice[] };

// Tasks are written from 橘子's real diary and weekly report (see 帶我回家 card).
const tasks: Task[] = [
  { id: "feed", time: "08:00", icon: "bowl", title: "準時餵早餐", note: "橘子只吃濕食，記得先退冰 10 分鐘。" },
  { id: "litter", time: "10:30", icon: "check", title: "清理貓砂盆", note: "牠很愛乾淨，砂盆髒了會坐在旁邊抗議。" },
  {
    id: "parkour",
    time: "03:00",
    icon: "moon",
    title: "凌晨跑酷事件",
    note: "橘子開始在走廊衝刺、抓門，你會怎麼做？",
    choices: [
      { text: "起床陪牠玩 10 分鐘逗貓棒", good: true, feedback: "中途日記寫過：睡前陪玩兩回合逗貓棒，牠就會一覺到天亮。明天睡前試試看！" },
      { text: "把牠關在房門外", good: false, feedback: "橘子會抓門抗議更久。中途建議睡前先陪牠玩，把精力消耗掉。" },
    ],
  },
  {
    id: "hairball",
    time: "14:00",
    icon: "cat",
    title: "突發狀況：吐毛球",
    note: "週三吐了一次毛球，要怎麼判斷需不需要看醫生？",
    choices: [
      { text: "先觀察精神和食慾，並記錄下來", good: true, feedback: "偶爾吐毛球很常見。如果一天吐好幾次、不吃東西或沒精神，請帶牠去看醫生。" },
      { text: "餵牠吃人用的腸胃藥", good: false, feedback: "請不要自行餵人用藥物。有任何疑慮，請帶牠去看醫生。" },
    ],
  },
];

const days = [1, 2, 3, 4, 5, 6, 7];

export default function Trial() {
  const [done, setDone] = useState<Record<string, boolean>>({ feed: true, litter: true });
  const [picked, setPicked] = useState<Record<string, number>>({});

  const count = tasks.filter((t) => done[t.id]).length;
  const allDone = count === tasks.length;

  return (
    <section id="trial" className={shared.section} aria-labelledby="trial-title">
      <div className="wrap">
        <SectionHead
          id="trial-title"
          icon="yarn"
          kicker="3D 養貓中心｜7 天虛擬飼養"
          title={
            <>
              <span>先跟牠的虛擬分身</span>
              <span>同居 7 天</span>
            </>
          }
          lead="虛擬分身參考本尊的照片生成，任務來自中途寫下的真實日記與每週週報。下面是橘子第 3 天的示意，點點看。"
        />
      </div>

      <EarTop color="var(--yellow-soft)" />
      <div className={styles.panel}>
        <div className={`wrap ${styles.grid}`}>
          <div className={styles.tasks}>
            <div className={styles.days} aria-label="7 天進度">
              {days.map((d) => (
                <span key={d} className={d < 3 ? styles.dayDone : d === 3 ? styles.dayNow : undefined}>
                  {d < 3 ? <Icon name="check" size={14} /> : `D${d}`}
                </span>
              ))}
            </div>

            <div className={styles.taskHead}>
              <h3>橘子的分身・第 3 天</h3>
              <span className={styles.progress}>
                今日 {count}/{tasks.length}
                <i style={{ width: `${(count / tasks.length) * 100}%` }} />
              </span>
            </div>

            <ul className={styles.list}>
              {tasks.map((t) => {
                const choice = picked[t.id];
                return (
                  <li key={t.id} className={`${styles.task} ${done[t.id] ? styles.taskDone : ""}`}>
                    <span className={styles.taskIcon}>
                      <Icon name={done[t.id] ? "check" : t.icon} size={20} />
                    </span>
                    <div className={styles.taskBody}>
                      <p className={styles.taskTitle}>
                        <time>{t.time}</time>
                        {t.title}
                      </p>
                      <p className={styles.note}>{t.note}</p>

                      {t.choices && (
                        <div className={styles.choices}>
                          {t.choices.map((c, i) => (
                            <button
                              key={c.text}
                              type="button"
                              aria-pressed={choice === i}
                              className={choice === i ? (c.good ? styles.good : styles.bad) : undefined}
                              onClick={() => {
                                setPicked((p) => ({ ...p, [t.id]: i }));
                                if (c.good) setDone((d) => ({ ...d, [t.id]: true }));
                              }}
                            >
                              {c.text}
                            </button>
                          ))}
                        </div>
                      )}
                      {choice !== undefined && t.choices && (
                        <p className={styles.feedback} role="status">
                          {t.choices[choice].feedback}
                        </p>
                      )}
                    </div>
                    {!t.choices && (
                      <button type="button" className={styles.toggle} aria-pressed={!!done[t.id]} onClick={() => setDone((d) => ({ ...d, [t.id]: !d[t.id] }))}>
                        {done[t.id] ? "已完成" : "完成"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            {allDone && (
              <p className={styles.cleared} role="status">
                <Icon name="badge" size={18} />
                第 3 天完成！再 4 天就能拿到虛擬飼養完成徽章。
              </p>
            )}

            <div className={styles.cta}>
              <CatButton href="/me" arrow>
                開始我的 7 天虛擬飼養
              </CatButton>
              <span>登入後選一隻想領養的貓就能開始。</span>
            </div>
          </div>

          {/* The stage 橘子 eats breakfast in */}
          <div className={styles.stage} aria-hidden>
            <svg className={styles.stageArt} viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">
              <rect width="400" height="300" fill="#fff6e4" />
              <path d="M250 40h110v140H250Z" fill="#fff" />
              <path d="M258 48h94v124h-94Z" fill="#fde9c0" />
              <path d="M305 48v124M258 110h94" stroke="#fff" strokeWidth="6" />
              <rect x="0" y="210" width="400" height="90" fill="#f3d9b2" />
              <rect x="0" y="206" width="400" height="8" fill="#efcd9e" />
              <ellipse cx="200" cy="246" rx="120" ry="22" fill="#f6c3b8" />
            </svg>
            <p className={styles.stageTag}>
              <Icon name="moon" size={14} />
              Demo 加速模式：1 天＝5 分鐘
            </p>
            <CatPerch action="eat" label="虛擬飼養第 3 天：吃早餐" className={styles.perch} />
          </div>
        </div>
      </div>
    </section>
  );
}
