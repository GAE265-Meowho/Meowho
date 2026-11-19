import type { SceneObject } from "../domain/schema";
export function ObjectDetails({
  object,
  onUpdate,
  onDelete,
}: {
  object: SceneObject;
  onUpdate: (patch: Partial<SceneObject>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="object-details">
      <label className="field">
        物件名稱
        <input
          maxLength={80}
          value={object.label}
          onChange={(e) => onUpdate({ label: e.target.value || "未命名物件" })}
        />
      </label>
      <p className="small">
        來源：
        {object.status === "Observation"
          ? "AI 候選，尚待確認"
          : object.status === "Hypothesis"
            ? "模擬假設"
            : "使用者確認物件"}
        。確認物件不代表確認其安全條件。
      </p>
      {object.status === "Observation" && (
        <button
          className="secondary"
          onClick={() => onUpdate({ status: "Confirmation" })}
        >
          確認此物件存在
        </button>
      )}
      <details>
        <summary>調整物件框的位置與大小</summary>
        <p className="small">
          建議直接在照片上拖拉或重畫。以下為進階數值備用：座標為照片比例 0–1。
        </p>
        <div className="coords">
          {["左", "上", "右", "下"].map((name, i) => (
            <label className="field" key={name}>
              {name}
              <input
                aria-label={`框${name}`}
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={object.bbox?.[i] ?? ""}
                onChange={(e) => {
                  if (e.target.value === "") return;
                  const box: [number, number, number, number] = object.bbox
                    ? [...object.bbox]
                    : [0.1, 0.1, 0.9, 0.9];
                  box[i] = Number(e.target.value);
                  onUpdate({ bbox: box });
                }}
              />
            </label>
          ))}
        </div>
        <button
          className="text-button"
          onClick={() => onUpdate({ bbox: null })}
        >
          清除定位框，保留物件
        </button>
      </details>
      <button className="text-button danger" onClick={onDelete}>
        刪除此標記（不代表物件已移除）
      </button>
    </div>
  );
}
