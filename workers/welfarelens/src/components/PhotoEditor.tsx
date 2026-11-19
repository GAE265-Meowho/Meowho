import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SceneObject } from "../domain/schema";
import { pointOnPhoto, drawBox, moveBox, resizeBox } from "../domain/geometry";
import type { Point, Box, Corner } from "../domain/geometry";

type Gesture = {
  pointer: number;
  id: string;
  start: Point;
  box: Box | null;
  corner?: Corner;
  draw: boolean;
};
const corners: [Corner, string][] = [
  ["nw", "左上"],
  ["ne", "右上"],
  ["sw", "左下"],
  ["se", "右下"],
];
export default function PhotoEditor({
  photo,
  objects,
  selected,
  onSelect,
  onBox,
}: {
  photo: string;
  objects: SceneObject[];
  selected: string;
  onSelect: (id: string) => void;
  onBox: (bbox: Box) => void;
}) {
  const frame = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null);
  const [drawing, setDrawing] = useState(false),
    [draft, setDraft] = useState<{ id: string; box: Box } | null>(null);
  const object = objects.find((o) => o.id === selected);
  const point = (e: ReactPointerEvent) =>
    pointOnPhoto(e.clientX, e.clientY, frame.current!.getBoundingClientRect());
  function begin(e: ReactPointerEvent, id: string, corner?: Corner) {
    if (e.button !== 0 || gesture.current) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(id);
    const o = objects.find((o) => o.id === id)!;
    gesture.current = {
      pointer: e.pointerId,
      id,
      start: point(e),
      box: o.bbox,
      corner,
      draw: drawing,
    };
    frame.current!.setPointerCapture(e.pointerId);
  }
  function value(e: ReactPointerEvent): Box | null {
    const g = gesture.current!;
    const p = point(e);
    return g.draw
      ? drawBox(g.start, p)
      : !g.box
        ? null
        : g.corner
          ? resizeBox(g.box, g.corner, p)
          : moveBox(g.box, [p[0] - g.start[0], p[1] - g.start[1]]);
  }
  function finish(e: ReactPointerEvent, cancel = false) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const box = cancel ? null : value(e);
    gesture.current = null;
    setDraft(null);
    if (frame.current?.hasPointerCapture(e.pointerId))
      frame.current.releasePointerCapture(e.pointerId);
    if (!cancel && box) {
      onBox(box);
      setDrawing(false);
    }
  }
  return (
    <>
      <div className="editor-tools">
        <button
          className="secondary"
          disabled={!object}
          aria-pressed={drawing}
          onClick={() => {
            setDrawing(!drawing);
            setDraft(null);
          }}
        >
          {drawing ? "取消重畫" : "重畫所選物件框"}
        </button>
        <p className="small">
          {drawing
            ? "在照片上拖出新框；取消重畫可退出。"
            : "拖動框內移動位置，拖四角調整大小。手機可用手指操作。"}
        </p>
      </div>
      <div
        ref={frame}
        aria-label="照片框選編輯區"
        className={`photo-frame editor-photo interactive-photo ${drawing ? "drawing" : ""}`}
        onPointerDown={(e) => {
          if (drawing && selected) begin(e, selected);
        }}
        onPointerMove={(e) => {
          if (gesture.current?.pointer === e.pointerId) {
            const box = value(e);
            setDraft(box ? { id: gesture.current.id, box } : null);
          }
        }}
        onPointerUp={(e) => finish(e)}
        onPointerCancel={(e) => finish(e, true)}
        onLostPointerCapture={(e) => finish(e, true)}
      >
        <img src={photo} alt="可標記的居家場景" draggable={false} />
        {objects.map((o) => {
          const box = draft?.id === o.id ? draft.box : o.bbox;
          if (!box) return null;
          return (
            <div
              key={o.id}
              className={`box-group ${selected === o.id ? "active" : ""}`}
              style={{
                left: `${box[0] * 100}%`,
                top: `${box[1] * 100}%`,
                width: `${(box[2] - box[0]) * 100}%`,
                height: `${(box[3] - box[1]) * 100}%`,
              }}
            >
              <button
                className={`object-box ${selected === o.id ? "selected" : ""}`}
                aria-label={`選取${o.label}`}
                aria-pressed={selected === o.id}
                style={{ left: 0, top: 0, width: "100%", height: "100%" }}
                onClick={() => onSelect(o.id)}
                onPointerDown={(e) => {
                  if (!drawing) begin(e, o.id);
                }}
                onKeyDown={(e) => {
                  const delta: Record<string, Point> = {
                    ArrowLeft: [-0.01, 0],
                    ArrowRight: [0.01, 0],
                    ArrowUp: [0, -0.01],
                    ArrowDown: [0, 0.01],
                  };
                  if (delta[e.key] && selected === o.id) {
                    e.preventDefault();
                    onBox(moveBox(box, delta[e.key]));
                  }
                }}
              >
                <span>
                  {o.label}
                  {o.status === "Observation" ? " · 待校正" : ""}
                </span>
              </button>
              {selected === o.id &&
                !drawing &&
                corners.map(([corner, label]) => (
                  <button
                    key={corner}
                    className={`resize-handle ${corner}`}
                    aria-label={`${label}角調整${o.label}`}
                    onPointerDown={(e) => begin(e, o.id, corner)}
                    tabIndex={-1}
                  />
                ))}
            </div>
          );
        })}
      </div>
      <p className="small">
        AI
        框為粗略候選，請對照照片校正。未框到不代表不存在；沒有框的物件可先選取，再按重畫。
      </p>
    </>
  );
}
