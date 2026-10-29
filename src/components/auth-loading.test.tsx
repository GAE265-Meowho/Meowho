// 登入狀態載入失敗時不可永遠停在「載入中」（Issue #33：正式站 /onboarding 卡在載入中）
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const getUser = vi.fn();
const sb = {
  auth: { getUser, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
  from: () => ({}),
};
vi.mock("@/lib/supabase/client", () => ({ getBrowserSupabase: () => sb }));
vi.mock("@/lib/supabase/config", () => ({ TERMS_VERSION: "t", isSupabaseConfigured: true }));

import { AuthProvider, useAuth } from "./Auth";

function Probe() {
  const { loading, user } = useAuth();
  return <p>{loading ? "載入中" : user ? "已登入" : "未登入"}</p>;
}

describe("AuthProvider 載入狀態", () => {
  it("getUser 連線失敗（例如網路被擋）時結束載入，顯示未登入", async () => {
    getUser.mockRejectedValue(new Error("Failed to fetch"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("未登入")).toBeTruthy());
  });
  it("沒有登入（正常情況）也結束載入", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("未登入")).toBeTruthy());
  });
});
