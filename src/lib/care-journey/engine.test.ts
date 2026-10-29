import { describe, expect, it } from "vitest";
import { addCommitment, bringBackPreparation, initialState, moveToStage, place, unmet } from "./engine";
describe("AI Care Journey demo engine",()=>{
 it("changes real requirements only by changing CatProfile",()=>{
   const x=initialState("xiaohe"),y=initialState("ali");
   expect(x.placements).toEqual(y.placements);
   expect(unmet(x).join("")).toContain("原箱");
   expect(unmet(y).join("")).toContain("低入口");
   expect(unmet(place(place(x,"box"),"mat"))).toEqual([]);
   expect(unmet(place(y,"lowLitter"))).toEqual([]);
 });
 it("rejects a configuration action that is not applicable",()=>{
  const before=initialState("ali");
  expect(place(before,"box")).toBe(before);
  expect(before.history).toEqual([]);
 });
 it("keeps future assumptions separate from present",()=>{
  const current=initialState("xiaohe"),future=moveToStage(current,"senior");
  expect(future.scope).toBe("future");
  const changed=addCommitment(future,{id:"future-review",label:"未來檢視用品",source:"future",status:"pending"});
  expect(current.commitments).toHaveLength(0);
  const returned=bringBackPreparation(current,changed);
  expect(returned.commitments).toHaveLength(1);
  expect(returned.commitments[0].status).toBe("pending");
  expect(returned.cat.age).toBe(4);
 });
 it("separates independent kitten learning from adult cat record",()=>{
  const adult=initialState("xiaohe"),kitten=moveToStage(adult,"kitten");
  expect(kitten.cat.id).toBe("mili");
  expect(kitten.scope).toBe("teaching");
  expect(bringBackPreparation(adult,kitten)).toEqual(adult);
 });
 it("does not duplicate a confirmed or pending commitment",()=>{
  const s=initialState("xiaohe"),commit={id:"x",label:"與朋友確認",source:"current",status:"pending" as const};
  expect(addCommitment(addCommitment(s,commit),commit).commitments).toHaveLength(1);
 });
});
