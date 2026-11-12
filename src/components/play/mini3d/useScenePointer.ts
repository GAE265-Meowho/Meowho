import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Raycaster, Vector2 } from "three";

type Handler = (event: PointerEvent, ray: Raycaster) => void;

export function useScenePointer(handlers: { down: Handler; move: Handler; release: Handler; reset?: () => void }) {
  const { gl, camera } = useThree();
  const latest = useRef(handlers);
  latest.current = handlers;
  const ray = useMemo(() => new Raycaster(), []);
  useEffect(() => {
    const canvas = gl.domElement;
    const point = new Vector2();
    const active = new Set<number>();
    function dispatch(event: PointerEvent, name: "down" | "move" | "release") {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      point.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      ray.setFromCamera(point, camera);
      latest.current[name](event, ray);
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      active.add(event.pointerId);
      canvas.setPointerCapture(event.pointerId);
      dispatch(event, "down");
    };
    const move = (event: PointerEvent) => {
      if (active.has(event.pointerId)) dispatch(event, "move");
    };
    const release = (event: PointerEvent) => {
      if (active.delete(event.pointerId)) latest.current.release(event, ray);
    };
    const reset = () => {
      for (const id of active) {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      }
      active.clear();
      latest.current.reset?.();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("lostpointercapture", release);
    window.addEventListener("blur", reset);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", release);
      canvas.removeEventListener("pointercancel", release);
      canvas.removeEventListener("lostpointercapture", release);
      window.removeEventListener("blur", reset);
      reset();
    };
  }, [gl, camera, ray]);
}
