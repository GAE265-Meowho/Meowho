// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRoomCache, isPrivateRoomBase, keepRecentRoom, MAX_ROOMS, roomFile } from "./home-room-cache";

const ORIGIN = "http://x";
/** 最小的 Cache Storage：每個名稱一個 Map（網址 → 內容） */
function fakeCaches() {
  const all = new Map<string, Map<string, Blob>>();
  const open = async (name: string) => {
    if (!all.has(name)) all.set(name, new Map());
    const m = all.get(name)!;
    const abs = (u: RequestInfo | URL) => new URL(String(u instanceof Request ? u.url : u), ORIGIN).href;
    return {
      match: async (u: RequestInfo) => (m.has(abs(u)) ? new Response(m.get(abs(u))) : undefined),
      put: async (u: RequestInfo, res: Response) => { m.set(abs(u), await res.blob()); },
      keys: async () => [...m.keys()].map(u => new Request(u)),
      delete: async (r: Request) => m.delete(r.url),
    };
  };
  return { all, open, keys: async () => [...all.keys()], delete: async (n: string) => all.delete(n) };
}

const memory = new Map<string, string>();
let fetched: string[] = [];
beforeEach(() => {
  memory.clear();
  fetched = [];
  vi.stubGlobal("caches", fakeCaches());
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k), key: () => null, length: 0, clear: () => memory.clear(),
  });
  vi.stubGlobal("fetch", async (u: string) => {
    fetched.push(u);
    return new Response(new Blob(["0123456789"]), { headers: { "Content-Length": "10" } });
  });
});
afterEach(() => vi.unstubAllGlobals());

const room = (n: number) => `/api/homes/h/room/room_${n}`;

describe("房間檔存在瀏覽器", () => {
  it("只有前台私有房間要自己存", () => {
    expect(isPrivateRoomBase("/api/homes/h/room/r")).toBe(true);
    expect(isPrivateRoomBase("https://x.supabase.co/storage/v1/object/public/meow-room-models/results/a")).toBe(false);
  });

  it("第一次下載並回報進度，第二次直接讀存好的", async () => {
    const progress: [number, number][] = [];
    const a = await roomFile(`${room(1)}/objects/room_cut.splat`, "u1", (l, t) => progress.push([l, t]));
    expect(await a.text()).toBe("0123456789");
    expect(progress.at(-1)).toEqual([10, 10]);
    await roomFile(`${room(1)}/objects/room_cut.splat`, "u1");
    expect(fetched).toHaveLength(1);
  });

  it("換帳號讀不到別人存的", async () => {
    await roomFile(`${room(1)}/scene.json`, "u1");
    await roomFile(`${room(1)}/scene.json`, "u2");
    expect(fetched).toHaveLength(2);
  });

  it("沒登入不存", async () => {
    await roomFile(`${room(1)}/scene.json`, null);
    await roomFile(`${room(1)}/scene.json`, null);
    expect(fetched).toHaveLength(2);
  });

  it(`超過 ${MAX_ROOMS} 間就刪掉最久沒看的那間`, async () => {
    for (let n = 1; n <= MAX_ROOMS + 1; n++) {
      await roomFile(`${room(n)}/scene.json`, "u1");
      await keepRecentRoom("u1", room(n));
    }
    fetched = [];
    await roomFile(`${room(1)}/scene.json`, "u1");  // 第 1 間被刪了，要重新下載
    await roomFile(`${room(MAX_ROOMS + 1)}/scene.json`, "u1");
    expect(fetched).toEqual([`${room(1)}/scene.json`]);
  });

  it("登出全部清掉", async () => {
    await roomFile(`${room(1)}/scene.json`, "u1");
    await keepRecentRoom("u1", room(1));
    await clearRoomCache();
    expect(await caches.keys()).toEqual([]);
    fetched = [];
    await roomFile(`${room(1)}/scene.json`, "u1");
    expect(fetched).toHaveLength(1);
  });
});
