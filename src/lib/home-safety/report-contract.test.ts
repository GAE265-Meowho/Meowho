import { expect, it } from "vitest";
import { hazardsFromReport } from "@/lib/play/player-data";
import golden from "./fixtures/meowho-result-v1.golden.json";

it("keeps the deployed five-field RPC item projection compatible with virtual care", () => {
  const items = golden.items.map(({ frame_index, t_s, ...item }) => {
    expect(frame_index).toBe(2);
    expect(t_s).toBe(14.5);
    return item;
  });
  expect(Object.keys(items[0]).sort()).toEqual(["crop_path", "key", "label", "level", "note"]);
  expect(hazardsFromReport(items)).toEqual([
    { key: "cable", label: "電線與插座", level: "high", advice: "收整線材" },
  ]);
});
