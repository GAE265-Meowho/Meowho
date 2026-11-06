// 成貓／幼貓膠囊切換（貓咪頁 3D 預覽、虛擬體驗共用）
import { BODY_LABELS, BODY_ORDER, type BodyType } from "@/lib/hq/cat-models/types";

export function BodySwitch({ value, onChange, label = "體型", unavailable = [] }: {
  value: BodyType; onChange: (body: BodyType) => void; label?: string;
  /** 還沒有確認貼圖、不能選的體型 */
  unavailable?: readonly BodyType[];
}) {
  return (
    <div className="hq-bodyseg" role="group" aria-label={label}>
      {BODY_ORDER.map(body => {
        const off = unavailable.includes(body);
        return (
          <button key={body} type="button" aria-pressed={value === body} disabled={off}
            title={off ? `還沒有確認的${BODY_LABELS[body]}紋理貼圖` : `切換成${BODY_LABELS[body]}`}
            onClick={() => onChange(body)}>
            {BODY_LABELS[body]}
          </button>
        );
      })}
    </div>
  );
}
