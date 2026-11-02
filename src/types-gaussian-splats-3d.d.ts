// @mkkellogg/gaussian-splats-3d 沒有附型別，這裡只宣告用到的部分
declare module "@mkkellogg/gaussian-splats-3d" {
  import type { Object3D, PerspectiveCamera, Vector3 } from "three";

  export const SceneFormat: { Splat: number };
  export const SceneRevealMode: { Instant: number };

  export interface SplatControls {
    target: Vector3;
    enableZoom: boolean;
    minPolarAngle: number;
    maxPolarAngle: number;
    keys: Record<string, string>;
    update(): void;
  }

  export class Viewer {
    constructor(options: Record<string, unknown>);
    camera: PerspectiveCamera;
    controls: SplatControls;
    addSplatScenes(
      scenes: { path: string; format: number; splatAlphaRemovalThreshold?: number; position?: number[] }[],
      showLoadingUI?: boolean,
      onProgress?: (percent: number) => void,
    ): Promise<void>;
    start(): void;
    forceRenderNextFrame(): void;
    getSplatScene(index: number): Object3D;
    dispose(): Promise<void>;
  }
}
