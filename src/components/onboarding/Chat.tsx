"use client";
import { useEffect, useRef, useState } from "react";
import { useUi } from "../Providers";

export interface ChatMessage { id: number; from: "bot" | "me"; text: string; image?: string }

let seq = 0;
export const botMsg = (text: string): ChatMessage => ({ id: ++seq, from: "bot", text });
export const meMsg = (text: string, image?: string): ChatMessage => ({ id: ++seq, from: "me", text, image });

/** 對話列表：新訊息出現時捲到最下面 */
export function ChatLog({ messages, typing }: { messages: ChatMessage[]; typing?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length, typing]);
  return (
    <div className="chat-log" aria-live="polite">
      {messages.map(m => (
        <div key={m.id} className={`chat-row ${m.from}`}>
          {m.from === "bot" && <span className="chat-avatar" aria-hidden="true">🐱</span>}
          <div className={`chat-bubble ${m.from}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {m.image && <img src={m.image} alt="上傳的貓咪照片" className="chat-img" />}
            {m.text}
          </div>
        </div>
      ))}
      {typing && (
        <div className="chat-row bot"><span className="chat-avatar" aria-hidden="true">🐱</span><div className="chat-bubble bot typing"><i /><i /><i /></div></div>
      )}
      <div ref={end} />
    </div>
  );
}

type SpeechRec = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };

/** 輸入列：文字＋語音（瀏覽器內建語音辨識，FR-03-05）＋快速選項 */
export function ChatInput({ onSend, chips = [], disabled, placeholder = "輸入回答，或按麥克風用說的…" }: {
  onSend: (text: string) => void; chips?: string[]; disabled?: boolean; placeholder?: string;
}) {
  const { toast } = useUi();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  const send = (t: string) => { const v = t.trim(); if (!v || disabled) return; onSend(v); setText(""); };

  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) { toast("這個瀏覽器不支援語音輸入，請改用打字"); return; }
    const rec = new Ctor();
    rec.lang = "zh-TW"; rec.interimResults = false;
    rec.onresult = e => setText(prev => (prev ? prev + " " : "") + Array.from(e.results).map(r => r[0].transcript).join(""));
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); toast("沒有聽清楚，再試一次或改用打字"); };
    recRef.current = rec; setListening(true); rec.start();
  };

  return (
    <div className="chat-input">
      {chips.length > 0 && (
        <div className="chat-chips">
          {chips.map(c => <button key={c} type="button" className="chip" disabled={disabled} onClick={() => send(c)}>{c}</button>)}
        </div>
      )}
      <form className="chat-form" onSubmit={e => { e.preventDefault(); send(text); }}>
        <label htmlFor="chat-text" className="sr">你的回答</label>
        <textarea id="chat-text" rows={1} value={text} disabled={disabled} placeholder={placeholder}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
        <button type="button" className={`icon-btn${listening ? " rec" : ""}`} aria-label={listening ? "停止錄音" : "用說的"} aria-pressed={listening} onClick={toggleMic} disabled={disabled}>🎙️</button>
        <button type="submit" className="btn sm" disabled={disabled || !text.trim()}>送出</button>
      </form>
    </div>
  );
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json();
}
