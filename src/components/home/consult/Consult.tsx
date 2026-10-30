"use client";

import { useEffect, useRef, useState } from "react";
import CatPerch from "@/components/journey/CatPerch";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import SectionHead from "../SectionHead";
import shared from "../section.module.css";
import styles from "./consult.module.css";

const guides = [
  { stage: "幼貓", title: "第一年的疫苗與結紮時程" },
  { stage: "成貓", title: "第一年大概要準備多少錢？" },
  { stage: "熟齡", title: "熟齡貓的飲食調整" },
  { stage: "居家", title: "接貓回家前的居家檢查" },
];

// Prototype answers. In the product these come from the 領養須知知識庫 via RAG;
// cost figures are always calculated from the knowledge base, never written by the LLM.
const answers: Record<string, string> = {
  "第一年要花多少錢？": "首年花費會依貓的年紀，從領養須知知識庫計算：飼料、貓砂、疫苗、結紮與基本健檢分開列出。選一隻想領養的貓，就能看到牠的明細。",
  "接貓回家前要準備什麼？": "先準備外出籠、貓砂盆、飲水與食碗、抓板和一個能躲的小窩；窗戶與陽台要加裝防護網。可以先到 AR 環境報告站，讓 AI 幫你看看家裡的可能風險。",
  "幼貓多久打疫苗？": "幼貓的疫苗通常分幾劑、間隔數週施打，實際時程請跟獸醫確認。領養須知裡有依年齡整理的提醒，接回家後也可以設定在時光小屋。",
  "貓咪不愛喝水怎麼辦？": "可以試試多放幾個水碗、換寬口的碗、使用流動飲水器，或在濕食裡多加一點水。如果同時有尿量變少、精神變差，請帶去看醫生。",
};

type Msg = { from: "bot" | "me"; text: string };

export default function Consult() {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "bot", text: "喵～有任何養貓、領養流程的問題，都可以問我喔！" }]);
  const [input, setInput] = useState("");
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    const reply = answers[text] ?? "這題我先記下來了！正式版會從領養須知知識庫找答案，並附上資料來源。也可以先試試下面的常見問題。";
    setMsgs((m) => [...m, { from: "me", text }, { from: "bot", text: reply }]);
    setInput("");
  }

  return (
    <section id="consult" className={`wrap ${shared.section}`} aria-labelledby="consult-title">
      <SectionHead
        id="consult-title"
        icon="book"
        kicker="貓咪諮詢站"
        title={
          <>
            <span>領養前的疑問，</span>
            <span>問喵喵就對了</span>
          </>
        }
        lead="依貓的年紀，整理領養須知與第一年的花費。"
      />

      <div className={styles.grid}>
        <ul className={styles.guides}>
          {guides.map((g) => (
            <li key={g.title}>
              <a href="#consult">
                <span className={styles.stage}>{g.stage}</span>
                <span className={styles.guideTitle}>{g.title}</span>
                <Icon name="book" size={20} />
              </a>
            </li>
          ))}
        </ul>

        <div className={styles.chat}>
          <CatPerch action="think" label="喵？有問題問我" className={styles.perch} />
          <div className={styles.chatHead}>
            <span className={styles.avatar}>
              <Icon name="cat" size={22} />
            </span>
            <div>
              {/* 回答一律來自領養須知知識庫（RAG）；費用數字由知識庫計算，不讓 LLM 自己產生。 */}
              <strong>喵喵小幫手</strong>
            </div>
          </div>
          <div ref={log} className={styles.log} aria-live="polite">
            {msgs.map((m, i) => (
              <p key={i} className={m.from === "bot" ? styles.bot : styles.me}>
                {m.text}
              </p>
            ))}
          </div>
          <div className={styles.faq}>
            {Object.keys(answers).map((q) => (
              <button key={q} type="button" onClick={() => ask(q)}>
                {q}
              </button>
            ))}
          </div>
          <form
            className={styles.inputRow}
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="輸入你的問題" aria-label="輸入你的問題" />
            <CatButton type="submit" size="sm">
              送出
            </CatButton>
          </form>
        </div>
      </div>
    </section>
  );
}
