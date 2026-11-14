import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Raycaster, Vector2 } from "three";

type Handler = (event: PointerEvent, ray: Raycaster) => void;

export function useScenePointer(handlers: { down: Handler; move: Handler; release: Handler; reset?: () => void; claim?: (event: PointerEvent, ray: Raycaster) => boolean; hover?: Handler; leave?: () => void }) {
  const { gl, camera } = useThree();
  const latest = useRef(handlers);
  latest.current = handlers;
  const ray = useMemo(() => new Raycaster(), []);
  useEffect(() => {
    const canvas = gl.domElement;
    const point = new Vector2();
    const active = new Set<number>();
    function dispatch(event: PointerEvent, name: "down" | "move" | "hover" | "claim") {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      point.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      ray.setFromCamera(point, camera);
      return latest.current[name]?.(event, ray);
    }
    const down = (event: PointerEvent) => {
      if (latest.current.claim && (!event.isPrimary || event.button !== 0)) {
        event.stopImmediatePropagation();
        return;
      }
      if (event.button !== 0) return;
      if (latest.current.claim) {
        if (active.size) { event.stopImmediatePropagation(); return; }
        if (!dispatch(event, "claim")) return;
        event.stopImmediatePropagation();
      }
      active.add(event.pointerId);
      canvas.setPointerCapture(event.pointerId);
      dispatch(event, "down");
    };
    const move = (event: PointerEvent) => {
      if (active.has(event.pointerId)) dispatch(event, "move");
      else if (event.pointerType === "mouse" && !event.buttons) dispatch(event, "hover");
    };
    const release = (event: PointerEvent) => {
      if (!active.delete(event.pointerId)) return;
      if (latest.current.claim) event.stopImmediatePropagation();
      latest.current.release(event, ray);
    };
    const leave = () => latest.current.leave?.();
    const reset = () => {
      for (const id of active) {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      }
      active.clear();
      latest.current.reset?.();
      leave();
    };
    canvas.addEventListener("pointerdown", down, true);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", release, true);
    canvas.addEventListener("pointercancel", release, true);
    canvas.addEventListener("lostpointercapture", release);
    window.addEventListener("blur", reset);
    return () => {
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", release, true);
      canvas.removeEventListener("pointercancel", release, true);
      canvas.removeEventListener("lostpointercapture", release);
      window.removeEventListener("blur", reset);
      reset();
    };
  }, [gl, camera, ray]);
}
