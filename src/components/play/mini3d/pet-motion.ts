import { AdditiveAnimationBlendMode, AnimationClip, AnimationMixer, MathUtils, Quaternion, QuaternionKeyframeTrack, Vector3, type AnimationAction, type Object3D } from "three";

// 沿鏡頭的左側離場，避免往畫面深處走時尾巴仍留在寬版邊緣。
const EXIT_YAW = -0.58;
const EXIT_DISTANCE = 1.4;
// 與共用房間的步態速度一致。GLB 朝 +Z，walk 的 root 沒有前進位移。
const WALK_SPEED = 0.35;

export function createPetMotion(cat: Object3D, clips: AnimationClip[]) {
  const mixer = new AnimationMixer(cat);
  const action = (name: string) => {
    const clip = AnimationClip.findByName(clips, name);
    return clip ? mixer.clipAction(clip).play() : null;
  };
  const idle = action("idle");
  const cuddle = action("cuddle");
  const walk = action("walk");

  cat.updateWorldMatrix(true, true);
  const head = cat.getObjectByName("head0");
  const up = new Vector3(0, 1, 0);
  if (head) up.applyQuaternion(head.getWorldQuaternion(new Quaternion()).invert());
  const turn = new Quaternion().setFromAxisAngle(up, -0.42).toArray();
  const avoid = head ? mixer.clipAction(new AnimationClip("pet-avoid", 1, [
    new QuaternionKeyframeTrack("head0.quaternion", [0, 1], [...turn, ...turn]),
  ], AdditiveAnimationBlendMode)).play() : null;

  function weight(clip: AnimationAction | null, value: number) {
    if (!clip) return;
    // 零權重時保留 Action，但暫停時鐘，下次可從第一幀平順接入。
    if (value > 0 && clip.paused) clip.reset();
    clip.paused = value === 0;
    clip.setEffectiveWeight(value);
  }

  let relaxed = 0;
  let resisting = 0;
  let walking = 0;
  let walked = 0;
  return {
    step(dt: number, pose: "idle" | "relaxed" | "resisting" | "leaving", reduced: boolean, group: Object3D, warning = 0) {
      const leaving = pose === "leaving";
      const mix = (value: number, target: boolean) => MathUtils.damp(value, Number(target), 13, dt);
      relaxed = cuddle && !reduced ? mix(relaxed, pose === "relaxed") : 0;
      resisting = reduced ? 0 : MathUtils.damp(resisting, leaving ? 0 : pose === "resisting" ? 1 : warning * 0.65, 13, dt);
      walking = walk && !reduced ? mix(walking, leaving) : 0;
      if (relaxed < 0.001) relaxed = 0;
      if (resisting < 0.001) resisting = 0;
      const cuddleWeight = relaxed * (1 - walking);
      weight(idle, 1 - cuddleWeight - walking);
      weight(cuddle, cuddleWeight);
      weight(walk, walking);
      weight(avoid, resisting);
      if (leaving && !reduced && walked < EXIT_DISTANCE) {
        group.rotation.y = Math.max(EXIT_YAW, group.rotation.y - dt * 3.6);
        // 轉身時先小步，對正後以原步態速度直行。
        const speed = group.rotation.y === EXIT_YAW ? WALK_SPEED : WALK_SPEED * 0.55;
        const step = Math.min(speed * dt, EXIT_DISTANCE - walked);
        walk?.setEffectiveTimeScale(speed / WALK_SPEED);
        group.position.x += Math.sin(group.rotation.y) * step;
        group.position.z += Math.cos(group.rotation.y) * step;
        walked += step;
      } else if (leaving && !reduced && walk) {
        walk.setEffectiveTimeScale(0);
      }
      mixer.update(reduced ? 0 : dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(cat);
    },
  };
}
