import { createScene } from "../domain/schema.ts";
import type { Scene } from "../domain/schema.ts";
import type { Evidence } from "../domain/assessment.ts";
export function demoScene(): Scene {
  const scene = createScene();
  scene.objects = [
    {
      id: "demo_window",
      kind: "window",
      label: "窗邊",
      bbox: [0.12, 0.1, 0.47, 0.55],
      status: "Confirmation",
      conditions: {
        openable: { value: true, status: "Confirmation" },
        protected: { value: false, status: "Confirmation" },
      },
    },
    {
      id: "demo_plant",
      kind: "plant",
      label: "品種待確認的盆栽",
      bbox: [0.64, 0.37, 0.85, 0.83],
      status: "Observation",
      conditions: {},
    },
  ];
  scene.conditions.hideout = { value: false, status: "Confirmation" };
  scene.conditions.plantInventoryComplete = {
    value: true,
    status: "Confirmation",
  };
  scene.conditions.windowInventoryComplete = {
    value: true,
    status: "Confirmation",
  };
  return scene;
}
export function demoEvidence(): Evidence {
  const fact=(key:string,value:boolean|string|null) => ({key,value,status:value===null?'UNKNOWN' as const:'CONFIRMATION' as const,evidence:'虛構示範設定，非真實照片或模型結果',confidence:'medium' as const});
  return {version:1,capture_id:'fictional-demo',mode:'OBSERVED',cases:[
    {rule_id:'H01',object_indices:[0],facts:[fact('opening_visible',true),fact('unguarded_opening',true),fact('access_route',true)],proposal:{kind:'RISK',action:'為窗邊安排牢固、合適的防護，完成前維持關窗並限制接近。',rationale:'阻隔從窗戶開口逃脫或墜落的路線。',placement:null}},
    {rule_id:'H02',object_indices:[1],facts:[fact('species',null),fact('reachable',true)]},
    {rule_id:'H11',object_indices:[],facts:[fact('concern_present',true)],proposal:{kind:'ENRICHMENT',action:'在沙發右側與盆栽之間的地面放置有遮蔽的紙箱，入口朝房間。',rationale:'提供可自主進出的退避與休息空間；此為虛構格局示範。',placement:{bbox:[.60,.68,.68,.83],description:'沙發右側地面',entrance:'朝向房間',preparation:'保持與盆栽分開，清空此處雜物',checks:'現場確認尺寸、通風、通行寬度與植物不可接觸'}}}
  ]};
}
