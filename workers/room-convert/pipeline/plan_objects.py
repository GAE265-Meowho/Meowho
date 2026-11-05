#!/usr/bin/env python3
"""讓視覺語言模型（Gemini）看幾張影格，從物品目錄勾選房間裡有的東西。

Grounding DINO 只會找你叫它找的東西，這一步負責決定「要找什麼」，換房間就不用改程式。
分工：catalog.py 寫死物品的描述、類型、材質和互動（調過的數值）；AI 只負責勾選這個房間有哪幾樣，
另外最多補 3 樣目錄沒有的（extras，這些才用 AI 估的值）。
目錄可以列很多樣，但 Grounding DINO 一次能吃的文字有限，叫它找房間沒有的東西也容易認錯，所以要 AI 先挑。

輸出 <ply 所在資料夾>/objects_plan.json，後面幾步沒給參數時都讀它：
  segment_objects.py  objects 的 name / prompt / multiple（kind=solid 放寬投票門檻）
  fit_furniture.py    kind=solid 算家具外框；surfaces 從上面放的物品找桌面
  extract_objects.py  kind=movable 拆成可動的 splat
  build_scene.py      目錄沒有的標籤（extras），用這裡的材質、重量和互動

  python pipeline/plan_objects.py rooms/room2/scene.ply --video videos/room2.mp4   # 重建前就能跑
  python pipeline/plan_objects.py rooms/room2/scene.ply --frames rooms/room2/frames
需要 GEMINI_API_KEY（Google AI Studio 免費方案）。影格是家裡的畫面，只送縮小過的幾張給 Google；
免費方案的條款允許 Google 用送出的內容改進產品。
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import cv2

from catalog import CATALOG

# 別名，Google 出新版會自動跟上；免費方案常回 503（太忙）、504（逾時）或 429（額度用完），就換下一個
MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"]
MAX_EXTRAS = 3
# 和 physics.js 的 SURFACES 一致
MATERIALS = ["rubber", "soft", "wood", "metal", "plastic", "glass", "cardboard", "stone"]
SURFACE_KINDS = [n for n, c in CATALOG.items() if c["kind"] == "surface"]
DETAIL_KINDS = [n for n, c in CATALOG.items() if c["detail"]]
CATALOG_LINES = "\n".join(f"- {n}: {c['prompt']}" for n, c in CATALOG.items())

PROMPT = f"""These frames come from one phone video walking through a room. A virtual cat will explore a 3D reconstruction of it.

catalog: pick every item from this list that is clearly visible in the frames. Pick by what the thing really is: a small foldable table on top of a bed is bed_tray, not desk.
{CATALOG_LINES}
- multiple: true when several separate copies are visible (e.g. a pair of shoes).
- holds: only for {SURFACE_KINDS}: the name of one picked item resting on top of it (e.g. "cup"). Leave the surface out if nothing picked rests on it. Use "" for every other item.
- detail: only for {DETAIL_KINDS}: color and shape words that tell it apart from similar-looking things in the room, e.g. "black cylindrical". Look closely: a tall black cylinder with vents is an air purifier, not a trash can. Use "" for every other item.

extras: at most {MAX_EXTRAS} notable physical objects that are clearly visible but match nothing in the catalog. Usually leave this empty.
- name: snake_case English. name_zh: its name in Traditional Chinese, e.g. "吉他". prompt: a short generic English noun phrase for an object detector, e.g. "a guitar"; do not add colors.
- kind: "solid" for large furniture standing on the floor that a cat can climb; "movable" for small things a cat could push; "fixed" for everything else.
- material: the closest of {MATERIALS}. mass_kg: rough real-world mass. jump_on / hide_under: whether a cat would jump on top / hide under it.
Never list walls, floors, ceilings, windows, doors, curtains, rugs, posters, clothes, people or anything mostly out of view."""

SCHEMA = {
    "type": "object",
    "properties": {
        "catalog": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "enum": list(CATALOG)},
                "multiple": {"type": "boolean"},
                "holds": {"type": "string"},
                "detail": {"type": "string"},
            },
            "required": ["name", "multiple", "holds", "detail"],
            "additionalProperties": False,
        }},
        "extras": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "name_zh": {"type": "string"},
                "prompt": {"type": "string"},
                "kind": {"type": "string", "enum": ["solid", "movable", "fixed"]},
                "multiple": {"type": "boolean"},
                "material": {"type": "string", "enum": MATERIALS},
                "mass_kg": {"type": "number"},
                "jump_on": {"type": "boolean"},
                "hide_under": {"type": "boolean"},
            },
            "required": ["name", "name_zh", "prompt", "kind", "multiple", "material", "mass_kg", "jump_on", "hide_under"],
            "additionalProperties": False,
        }},
    },
    "required": ["catalog", "extras"],
    "additionalProperties": False,
}


def plan_path(ply):
    return Path(ply).parent / "objects_plan.json"


def load_plan(ply):
    """沒有清單時回傳 None，各步驟就照舊只用命令列參數。"""
    p = plan_path(ply)
    return json.loads(p.read_text()) if p.exists() else None


def sample_frames(source, count, side):
    """從影片或影格資料夾平均取 count 張，縮小後編成 JPEG。直接讀影片，不用等抽影格。"""
    if source.is_dir():
        paths = sorted(source.glob("*.jpg")) + sorted(source.glob("*.png"))
        total, read = len(paths), lambda i: cv2.imread(str(paths[i]))
    else:
        cap = cv2.VideoCapture(str(source))
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        def read(i):
            cap.set(cv2.CAP_PROP_POS_FRAMES, i)
            ok, img = cap.read()
            return img if ok else None
    if total <= 0:
        raise RuntimeError(f"{source} 讀不到影格")
    images = []
    for i in dict.fromkeys(round(k * (total - 1) / max(count - 1, 1)) for k in range(min(count, total))):
        img = read(i)
        if img is None:
            continue
        scale = side / max(img.shape[:2])
        if scale < 1:
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        images.append(cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes())
    if not images:
        raise RuntimeError(f"{source} 讀不到影格")
    return images


def slug(name):
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def with_detail(c, detail):
    """"an air purifier" + "black cylindrical" → "a black cylindrical air purifier"；只有目錄標 detail 的物品才加。"""
    detail = " ".join(detail.split()[:4])  # 太長的描述 Grounding DINO 反而認不出來
    if not (c["detail"] and detail):
        return c["prompt"]
    noun = c["prompt"].split(" ", 1)[1] if c["prompt"].split(" ", 1)[0] in ("a", "an") else c["prompt"]
    return f"a {detail} {noun}"


def to_plan(answer):
    """AI 的勾選結果 → 後面幾步讀的格式。目錄物品的描述、類型和數值一律用目錄的，AI 只決定有沒有、有幾個。"""
    objects, surfaces = [], []
    for pick in answer["catalog"]:
        c = CATALOG.get(pick["name"])
        if not c:
            continue
        aff, phys = c["affordance"], c["physics"]
        if c["kind"] == "surface":
            surfaces.append({"name": pick["name"], "holds": pick["holds"], "material": phys["surface"],
                             "hide_under": aff.get("hide_under", False)})
        else:
            objects.append({"name": pick["name"], "prompt": with_detail(c, pick.get("detail", "")), "kind": c["kind"],
                            "multiple": pick["multiple"] or c["multiple"], "material": phys["surface"],
                            "mass_kg": phys.get("mass_kg", 0), "jump_on": aff.get("jump_on", False),
                            "hide_under": aff.get("hide_under", False), "from": "catalog"})
    for e in answer["extras"][:MAX_EXTRAS]:
        if slug(e["name"]) not in CATALOG:  # AI 自己取的名字撞到目錄，就當它沒認出來
            objects.append({**e, "from": "ai"})
    return clean({"objects": objects, "surfaces": surfaces})


def clean(plan):
    """名稱統一成小寫底線、去掉重複；桌面只留下面真的有物品的。"""
    seen, objects = set(), []
    for o in plan["objects"]:
        o["name"] = slug(o["name"])
        if o["name"] and o["name"] not in seen:
            seen.add(o["name"])
            objects.append(o)
    surfaces = []
    for s in plan["surfaces"]:
        s["name"], s["holds"] = slug(s["name"]), slug(s["holds"])
        if s["name"] and s["holds"] in seen and s["name"] not in seen:
            seen.add(s["name"])
            surfaces.append(s)
    return {"objects": objects, "surfaces": surfaces}


def ask(images):
    """回傳 (清單, 用的模型)。任何失敗都丟 RuntimeError，由 main 改用預設清單。"""
    from google import genai
    from google.genai import errors, types
    env = Path(__file__).resolve().parent.parent / ".env.worker"  # 直接跑 room_demo.sh 時沒經過 worker
    if not os.environ.get("GEMINI_API_KEY") and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = line.split("=", 1)[1].strip()
    if not os.environ.get("GEMINI_API_KEY"):
        raise RuntimeError("沒有 GEMINI_API_KEY，請放進 .env.worker（Google AI Studio 申請）")
    # 金鑰從 GEMINI_API_KEY 讀；要存成變數，暫時物件會被回收、連線跟著關掉
    # 每個模型最多等 60 秒、重試一次，SDK 預設會自己重試好幾分鐘
    client = genai.Client(http_options=types.HttpOptions(timeout=60_000, retry_options=types.HttpRetryOptions(attempts=2)))
    for model in MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                contents=[types.Part.from_bytes(data=d, mime_type="image/jpeg") for d in images] + [PROMPT],
                config=types.GenerateContentConfig(response_mime_type="application/json", response_json_schema=SCHEMA),
            )
        except errors.APIError as e:
            if e.code not in (429, 503, 504) or model == MODELS[-1]:
                raise RuntimeError(f"{model} 失敗（{e.code}）：{e.message}") from e
            print(f"[plan] {model} 暫時不能用（{e.code}），改用下一個", flush=True)
            continue
        except Exception as e:  # 逾時、斷線：SDK 丟的是 httpx 的例外
            if model == MODELS[-1]:
                raise RuntimeError(f"{model} 失敗：{e}") from e
            print(f"[plan] {model} 連不上（{type(e).__name__}），改用下一個", flush=True)
            continue
        u = response.usage_metadata
        print(f"[plan] {model}: 輸入 {u.prompt_token_count} token，思考 {u.thoughts_token_count or 0}，輸出 {u.candidates_token_count}")
        if not response.text:
            raise RuntimeError(f"{model} 沒有回清單（{response.candidates[0].finish_reason if response.candidates else response.prompt_feedback}）")
        return json.loads(response.text), model


def default_plan():
    """AI 辨識失敗時的基本清單（原本寫死在 room_demo.sh 的那份），轉換才不會整個失敗。"""
    picks = [{"name": n, "multiple": False, "holds": "", "detail": ""} for n in ("cup", "backpack", "purifier", "bed", "sofa", "shoe")]
    return to_plan({"catalog": picks + [{"name": "desk", "multiple": False, "holds": "cup", "detail": ""}], "extras": []})


def main():
    ap = argparse.ArgumentParser(description="用視覺語言模型決定要切哪些物品")
    ap.add_argument("ply", type=Path, help="房間 scene.ply（還不用存在），清單寫在旁邊")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--video", type=Path, help="原始影片，可以在重建前就跑")
    src.add_argument("--frames", type=Path, help="影格資料夾")
    ap.add_argument("--count", type=int, default=8, help="送幾張影格（平均取樣）")
    ap.add_argument("--side", type=int, default=1024, help="影格縮到最長邊幾像素")
    args = ap.parse_args()

    t0 = time.time()
    try:
        answer, source = ask(sample_frames(args.video or args.frames, args.count, args.side))
        plan = to_plan(answer)
    except Exception as e:  # 辨識只是決定要找什麼，失敗就用基本清單，不要讓整個轉換白跑
        print(f"[plan] ⚠️ AI 辨識失敗，改用基本清單：{e}", flush=True)
        plan, source = default_plan(), "default"
    plan.update(source=source, seconds=round(time.time() - t0, 1))
    plan_path(args.ply).write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    for o in plan["objects"]:
        tag = "目錄" if o.get("from") == "catalog" else "AI補充"
        print(f"[plan] {o['name']:<14} {o['kind']:<8} {tag:<5} \"{o['prompt']}\"{'（多個）' if o['multiple'] else ''}")
    for s in plan["surfaces"]:
        print(f"[plan] {s['name']:<14} surface  目錄  上面有 {s['holds']}")
    print(f"[plan] 來源 {source}，{plan['seconds']} 秒")


if __name__ == "__main__":
    main()
