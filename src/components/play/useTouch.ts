"use client";
// 這個裝置主要是用手指嗎（手機、平板：pointer: coarse）：小遊戲的操作說明依這個挑手機版或電腦版（lib/play/control-text.ts）。
// 伺服器端先當電腦，到瀏覽器再換，不會造成 hydration 錯誤。
import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";
const subscribe = (fn: () => void) => {
  const mq = typeof window !== "undefined" ? window.matchMedia?.(QUERY) : undefined;
  mq?.addEventListener?.("change", fn);
  return () => mq?.removeEventListener?.("change", fn);
};
const snapshot = () => (typeof window !== "undefined" ? Boolean(window.matchMedia?.(QUERY).matches) : false);

export const useTouch = (): boolean => useSyncExternalStore(subscribe, snapshot, () => false);
