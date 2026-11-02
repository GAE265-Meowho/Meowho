"use client";
// 舊網址：「我的領養申請」已併入「領養管理」（#128）。0011 寫的通知連結指到這裡，帶著 ?t= 轉過去。
import { useEffect } from "react";

export default function ApplicationsRedirect() {
  useEffect(() => { window.location.replace(`/me/adoptions${window.location.search}`); }, []);
  return null;
}
