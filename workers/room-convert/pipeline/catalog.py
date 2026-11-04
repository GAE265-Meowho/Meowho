"""物品目錄：我們寫死的物品，每樣的描述、類型、材質、重量和貓的互動都在這裡調。

plan_objects.py 讓 AI 只從這裡勾選房間有的東西，目錄沒有的才讓 AI 自己估（extras）。
build_scene.py 依標籤查這裡的互動和物理。改數值後重跑 build_scene.py 就會生效。

kind:
  solid    放在地上的大型家具，fit_furniture.py 算外框並拆成可以站的幾層（床、沙發）
  surface  桌面類，AI 要指出上面放了哪樣物品，從那樣物品的底部高度找桌面（常被雜物蓋住、切不完整）
  movable  貓推得動的小東西，extract_objects.py 拆成可以單獨移動的 splat
  fixed    其他不會動的東西
physics 的 surface 是 physics.js 的 SURFACES 材質，決定摩擦力、彈性和碰撞音色。
detail=True  長得像別的東西，讓 AI 補上顏色、形狀（"a black cylindrical air purifier"）。
             Grounding DINO 會把框分給最像的描述，黑色清淨機只寫 "an air purifier" 會被 "a trash can" 搶走。
             其他物品維持通用描述：鞋子寫成「白色球鞋」，黑鞋就找不到。
"""


def fixed(surface):
    return {"body": "fixed", "surface": surface}


def dynamic(mass, surface):
    return {"body": "dynamic", "mass_kg": mass, "collider": "convex_hull", "surface": surface}


def item(prompt, kind, physics, multiple=False, detail=False, **affordance):
    return {"prompt": prompt, "kind": kind, "physics": physics, "multiple": multiple, "detail": detail,
            "affordance": affordance}


CATALOG = {
    # 大型家具
    "bed":            item("a bed", "solid", fixed("soft"), jump_on=True),
    "sofa":           item("a sofa", "solid", fixed("soft"), jump_on=True, hide_under=True),
    # 桌面
    "desk":           item("a desk", "surface", fixed("wood"), jump_on=True, hide_under=True),
    "table":          item("a table", "surface", fixed("wood"), jump_on=True, hide_under=True),
    "nightstand":     item("a nightstand", "surface", fixed("wood"), jump_on=True),
    # 貓推得動的小東西
    "cup":            item("a cup", "movable", dynamic(0.3, "glass"), push=True),
    "shoe":           item("a shoe", "movable", dynamic(0.4, "plastic"), multiple=True, push=True, play=True),
    "backpack":       item("a backpack", "movable", dynamic(1.5, "soft"), push=True),
    "bottle":         item("a bottle", "movable", dynamic(0.5, "plastic"), multiple=True, push=True),
    "book":           item("a book", "movable", dynamic(0.4, "cardboard"), multiple=True, push=True),
    "pillow":         item("a pillow", "movable", dynamic(0.5, "soft"), push=True, play=True),
    "laptop":         item("a laptop", "movable", dynamic(1.5, "metal"), push=True),
    "cardboard_box":  item("a cardboard box", "movable", dynamic(0.5, "cardboard"), multiple=True, push=True, hide_under=True),
    # 不會動的東西
    "purifier":       item("an air purifier", "fixed", fixed("plastic"), detail=True),
    "trash_can":      item("a trash can", "fixed", fixed("plastic"), detail=True),
    "towel":          item("a towel", "fixed", fixed("soft")),
    "chair":          item("a chair", "fixed", fixed("wood"), jump_on=True, hide_under=True),
    "stool":          item("a stool", "fixed", fixed("wood"), jump_on=True),
    "wardrobe":       item("a wardrobe", "fixed", fixed("wood")),
    "drawers":        item("a chest of drawers", "fixed", fixed("wood"), jump_on=True),
    "refrigerator":   item("a refrigerator", "fixed", fixed("metal"), jump_on=True),
    "bicycle":        item("a bicycle", "fixed", fixed("metal")),
    "electric_fan":   item("an electric fan", "fixed", fixed("plastic")),
    "laundry_basket": item("a laundry basket", "fixed", fixed("plastic")),
    "storage_cart":   item("a rolling storage cart", "fixed", fixed("metal")),
    "bed_tray":       item("a small foldable laptop table", "fixed", fixed("wood")),
    "floor_lamp":     item("a floor lamp", "fixed", fixed("metal")),
    "television":     item("a television", "fixed", fixed("plastic")),
    "potted_plant":   item("a potted plant", "fixed", fixed("stone")),
}

# 檢視器顯示的中文名稱，寫進 scene.json 的 name_zh
NAMES_ZH = {
    "bed": "床", "sofa": "沙發", "desk": "書桌", "table": "桌子", "nightstand": "床頭櫃",
    "cup": "杯子", "shoe": "鞋子", "backpack": "背包", "bottle": "瓶子", "book": "書", "pillow": "枕頭",
    "laptop": "筆電", "cardboard_box": "紙箱", "purifier": "空氣清淨機", "trash_can": "垃圾桶", "towel": "毛巾",
    "chair": "椅子", "stool": "凳子", "wardrobe": "衣櫃", "drawers": "抽屜櫃", "refrigerator": "冰箱",
    "bicycle": "腳踏車", "electric_fan": "電風扇", "laundry_basket": "洗衣籃", "storage_cart": "置物推車",
    "bed_tray": "床上小桌", "floor_lamp": "立燈", "television": "電視", "potted_plant": "盆栽",
}
for _name, _c in CATALOG.items():
    _c["zh"] = NAMES_ZH[_name]

# build_scene.py 原本的對照表格式：標籤 → (互動, 物理)
AFFORDANCES = {name: (c["affordance"], c["physics"]) for name, c in CATALOG.items()}

if __name__ == "__main__":  # 自我檢查：材質要和 physics.js 一致、類型要是四種之一
    import re
    from pathlib import Path
    js = (Path(__file__).resolve().parent.parent / "physics.js").read_text()
    materials = set(re.findall(r"^\s+(\w+): \{ friction", js, re.M))
    for name, c in CATALOG.items():
        assert c["physics"]["surface"] in materials, (name, c["physics"]["surface"])
        assert c["kind"] in ("solid", "surface", "movable", "fixed"), name
        assert (c["kind"] == "movable") == (c["physics"]["body"] == "dynamic"), name
        assert c["zh"], name
    print(f"catalog ok: {len(CATALOG)} 樣")
