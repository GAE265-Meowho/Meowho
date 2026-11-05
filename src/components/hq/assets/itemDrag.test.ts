import { describe, expect, it } from "vitest";
import { HOUSEHOLD_ITEM_MIME, readItemDragId, setItemDragData } from "./itemDrag";

describe("itemDrag", () => {
  it("寫入與讀取用品 id", () => {
    const store = new Map<string, string>();
    const dt = {
      effectAllowed: "none" as string,
      setData: (type: string, value: string) => { store.set(type, value); },
      getData: (type: string) => store.get(type) ?? "",
    };
    setItemDragData(dt as unknown as DataTransfer, "item_1");
    expect(dt.effectAllowed).toBe("copy");
    expect(store.get(HOUSEHOLD_ITEM_MIME)).toBe("item_1");
    expect(readItemDragId(dt as unknown as DataTransfer)).toBe("item_1");
  });
});
