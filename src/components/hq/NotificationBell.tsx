"use client";
// MeowHQ 頂列鈴鐺（Issue #23）：點開顯示自己最近 10 則站內通知（meow_notifications，RLS 只讀得到自己的），可標為已讀。
import Link from "next/link";
import { useCallback, useState } from "react";
import { formatTaipei } from "@/lib/hq/audit";
import { getBrowserSupabase } from "@/lib/supabase/client";

interface Notice { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

const icon = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, width: 20, height: 20, viewBox: "0 0 24 24" } as const;

export function NotificationBell({ unread, userId, onChanged }: { unread: number; userId?: string | null; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (!sb || !userId) { setItems([]); return; }
    const { data, error } = await sb.from("meow_notifications").select("id, title, body, link, read_at, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
    setFailed(Boolean(error));
    setItems(error ? [] : (data ?? []) as Notice[]);
  }, [userId]);

  const markRead = useCallback(async (ids: string[]) => {
    const sb = getBrowserSupabase();
    if (!sb || !userId || ids.length === 0) return;
    const now = new Date().toISOString();
    const { error } = await sb.from("meow_notifications").update({ read_at: now }).eq("user_id", userId).in("id", ids).is("read_at", null);
    if (error) { setFailed(true); return; }
    setItems(list => list?.map(n => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)) ?? null);
    onChanged?.();
  }, [userId, onChanged]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };
  const unreadIds = (items ?? []).filter(n => !n.read_at).map(n => n.id);

  return (
    <div className="hq-menu-wrap">
      <button className="hq-iconbtn hq-bell" aria-label={`通知${unread ? `，${unread} 則未讀` : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        <svg {...icon}><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4" /></svg>
        {unread > 0 && <span className="hq-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="hq-menu hq-notif" role="dialog" aria-label="通知">
          <div className="hq-row hq-notif-head">
            <strong>通知</strong>
            <span className="hq-grow" />
            {unreadIds.length > 0 && <button className="hq-btn ghost small" onClick={() => void markRead(unreadIds)}>全部標為已讀</button>}
          </div>
          {items === null ? <p className="hq-hint">載入中…</p>
            : failed ? <p className="hq-hint" role="alert">通知暫時無法更新，請稍後再試</p>
            : items.length === 0 ? <p className="hq-hint">目前沒有通知</p>
            : (
              <ul className="hq-log">
                {items.map(n => (
                  <li key={n.id} className={n.read_at ? "" : "unread"}>
                    {n.link
                      ? <Link href={n.link} onClick={() => { void markRead([n.id]); setOpen(false); }}><strong>{n.title}</strong></Link>
                      : <strong>{n.title}</strong>}
                    {n.body && <span className="hq-hint">{n.body}</span>}
                    <time className="hq-hint">{formatTaipei(n.created_at)}</time>
                    {!n.read_at && <button className="hq-btn ghost small" onClick={() => void markRead([n.id])}>標為已讀</button>}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  );
}
