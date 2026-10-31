"use client";

import { useEffect, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import { useReducedMotion } from "@/lib/useReducedMotion";
import styles from "./hero.module.css";

const suggestions = ["上班族，白天不在家，想要獨立一點的貓", "家裡有小孩，想找溫和的貓", "可以照顧需要特別照護的貓"];

/** Types each suggestion out, holds, deletes it, then moves to the next. */
function useTypewriter(phrases: string[], paused: boolean) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (paused) return;
    let i = 0;
    let n = 0;
    let deleting = false;
    let timer: number;
    const tick = () => {
      const phrase = phrases[i];
      if (!deleting) {
        n++;
        setText(phrase.slice(0, n));
        if (n === phrase.length) {
          deleting = true;
          timer = window.setTimeout(tick, 1800);
          return;
        }
        timer = window.setTimeout(tick, 80);
      } else {
        n--;
        setText(phrase.slice(0, n));
        if (n === 0) {
          deleting = false;
          i = (i + 1) % phrases.length;
          timer = window.setTimeout(tick, 400);
          return;
        }
        timer = window.setTimeout(tick, 28);
      }
    };
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [phrases, paused]);

  return text;
}

export default function TypeSearch() {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();
  const [sent, setSent] = useState(false);

  const typed = useTypewriter(suggestions, focused || reducedMotion || query !== "");
  const placeholder = focused
    ? "說說你住哪、有沒有養過貓、喜歡什麼個性"
    : reducedMotion
      ? `例如：${suggestions[0]}`
      : `例如：${typed}▍`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSent(true);
    document.getElementById("adopt")?.scrollIntoView();
  }

  return (
    <form id="match" className={styles.search} onSubmit={submit}>
      <label htmlFor="match-input">一句話 AI 配對｜說說你的生活，幫你找合得來的貓</label>
      <div className={styles.searchPill}>
        <input
          id="match-input"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setSent(false);
          }}
        />
        <CatButton type="submit">
          幫我找貓
        </CatButton>
      </div>
      {sent && (
        <p className={styles.sent} role="status">
          收到！配對結果頁會在後面的區塊做出來。
        </p>
      )}
    </form>
  );
}
