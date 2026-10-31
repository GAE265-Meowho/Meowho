/*
 * 貓眼材質：MeshPhysicalMaterial + onBeforeCompile，角膜凸起、折射、虹膜、細縫瞳孔全部在 shader 裡算。
 * 眼睛正前方是物件的 +Z（Object3D.lookAt 會讓 +Z 對準目標）。
 * 移植自 Meow/cat_studio/cat_eye.js（three 0.160 → 0.180，改寫成 TypeScript，shader 內容不變）。
 *
 * 改寫自 "Refractive Procedural Eye" by tentabrobpy（https://godotshaders.com/shader/eye/），MIT License：
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 *   associated documentation files (the "Software"), to deal in the Software without restriction, including
 *   without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
 *   following conditions: The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 * 修改：Godot → three.js、圓形瞳孔 → 貓的垂直細縫（兩圓交集的透鏡形）、虹膜加內外圈漸層與深色外環。
 */
import * as THREE from "three";

export interface EyeParams {
  pupil: number;        // 0 = 細縫，1 = 全圓（放大）
  irisSize: number;     // 虹膜佔眼球的比例
  corneaBulge: number;  // 角膜凸起程度
  ior: number;          // 角膜折射率
  irisInner: string;
  irisOuter: string;
  pupilColor: string;
  scleraColor: string;
}

export const EYE_DEFAULTS: EyeParams = {
  pupil: 0.25,
  irisSize: 0.6,
  corneaBulge: 0.7,
  ior: 1.376,
  irisInner: "#a8b83a",
  irisOuter: "#d99a1e",
  pupilColor: "#050404",
  scleraColor: "#e6dccd",
};

const COLOR_KEYS = { irisInner: "uIrisInner", irisOuter: "uIrisOuter", pupilColor: "uPupilColor", scleraColor: "uScleraColor" } as const;
const FLOAT_KEYS = { pupil: "uPupil", irisSize: "uIrisSize", corneaBulge: "uCorneaBulge", ior: "uIOR" } as const;

const VERT_HEAD = /* glsl */ `
uniform float uIrisSize;
uniform float uCorneaBulge;
varying vec3 vEyePos;
varying vec3 vEyeNormal;
varying vec3 vEyeCam;
varying float vEyeR;
`;

// 把虹膜前方的球面推成角膜圓頂，法線在邊緣平滑過渡
const VERT_BULGE = /* glsl */ `
float eyeR = length(position);
float irisAngle = uIrisSize * PI * 0.5;
float irisR = sin(irisAngle) * eyeR;
float corneaDepth = cos(irisAngle) * eyeR;
float corneaR = mix(eyeR, irisR, uCorneaBulge);
vec3 corneaC = vec3(0.0, 0.0, corneaDepth - sqrt(corneaR * corneaR - irisR * irisR));
vec3 toCornea = position - corneaC;
float corneaDist = length(toCornea) - corneaR;
vec3 corneaN = toCornea / length(toCornea);
vec3 eyePos = corneaDist < 0.0 ? position - corneaN * corneaDist : position;
objectNormal = normalize(mix(objectNormal, corneaN, smoothstep(0.0, -0.1 * uIrisSize * eyeR, corneaDist)));
vEyeR = eyeR;
vEyePos = eyePos;
vEyeNormal = objectNormal;
vEyeCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
`;

const FRAG_HEAD = /* glsl */ `
uniform float uIrisSize;
uniform float uPupil;
uniform float uIOR;
uniform vec3 uIrisInner;
uniform vec3 uIrisOuter;
uniform vec3 uPupilColor;
uniform vec3 uScleraColor;
varying vec3 vEyePos;
varying vec3 vEyeNormal;
varying vec3 vEyeCam;
varying float vEyeR;

const float EYE_TAU = 6.28318530718;

// 依像素寬度淡出的 cos，避免遠看時條紋閃爍（https://iquilezles.org/articles/bandlimiting/）
float eyeFcos(float x) {
  return cos(x) * smoothstep(EYE_TAU, 0.0, fwidth(x));
}

// 貓的細縫瞳孔：兩個圓的交集（上下兩端是尖的），寬高相等時變成圓形
float eyePupilSdf(vec2 p) {
  float w = mix(0.05, 0.8, uPupil);
  float h = mix(0.92, 0.8, uPupil);
  float rc = (h * h + w * w) / (2.0 * w);
  float off = rc - w;
  return max(length(p - vec2(off, 0.0)), length(p + vec2(off, 0.0))) - rc;
}

vec3 eyeIrisColor(vec2 p) {
  float r = length(p);
  // atan 在左側有接縫，取 fwidth 較小的那組角度（https://bgolus.medium.com/rendering-a-sphere-on-a-quad-13c92025570c）
  float a = atan(p.y, p.x) / EYE_TAU;
  float af = fract(a);
  float ang = fwidth(a) < fwidth(af) ? a : af;

  float fibers = eyeFcos(ang * EYE_TAU * 37.0 + r * 4.0) * 0.5
               + eyeFcos(ang * EYE_TAU * 23.0 - r * 3.0) * 0.35
               + eyeFcos(ang * EYE_TAU * 61.0) * 0.15;
  vec3 col = mix(uIrisInner, uIrisOuter, smoothstep(0.1, 0.9, r));
  col *= 0.8 + 0.3 * fibers;
  col *= mix(1.0, 0.35, smoothstep(0.82, 1.0, r));       // 深色外環

  float d = eyePupilSdf(p);
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.12, d));         // 瞳孔周圍稍暗
  float aa = fwidth(d) + 0.005;
  return mix(col, uPupilColor, smoothstep(aa, -aa, d));
}
`;

// 視線穿過角膜折射後打到內凹的虹膜平面，用交點當虹膜座標
const FRAG_COLOR = /* glsl */ `
{
  vec3 rd = normalize(vEyePos - vEyeCam);
  rd = normalize(refract(rd, normalize(vEyeNormal), 1.0 / uIOR));
  float irisAngle = uIrisSize * PI * 0.5;
  float irisR = sin(irisAngle) * vEyeR;
  float corneaDepth = cos(irisAngle) * vEyeR;
  float t = (corneaDepth - 0.02 * vEyeR - vEyePos.z) / rd.z;
  vec2 irisP = (vEyePos.xy + rd.xy * t) / irisR;
  float blend = 0.1 * uIrisSize * vEyeR;
  float irisMask = smoothstep(corneaDepth - blend, corneaDepth, vEyePos.z);
  diffuseColor.rgb = mix(uScleraColor, eyeIrisColor(irisP), irisMask);
}
`;

type EyeUniforms = Record<string, { value: number | THREE.Color }>;

export function createCatEyeMaterial(params: Partial<EyeParams> = {}): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    roughness: 0.08,
    specularIntensity: 0.3,     // 底層反射壓低，瞳孔才夠黑；亮點交給 clearcoat
    clearcoat: 1,
    clearcoatRoughness: 0.03,   // 濕潤的角膜反光
  });
  const uniforms: EyeUniforms = {};
  for (const u of Object.values(FLOAT_KEYS)) uniforms[u] = { value: 0 };
  for (const u of Object.values(COLOR_KEYS)) uniforms[u] = { value: new THREE.Color() };
  material.userData.eyeUniforms = uniforms;
  setCatEyeParams(material, { ...EYE_DEFAULTS, ...params });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n" + VERT_HEAD)
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n" + VERT_BULGE)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = eyePos;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + FRAG_HEAD)
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + FRAG_COLOR);
  };
  return material;
}

/** 只更新有傳進來的欄位；顏色用 '#rrggbb' */
export function setCatEyeParams(material: THREE.Material, params: Partial<EyeParams>) {
  const uniforms = material.userData.eyeUniforms as EyeUniforms;
  for (const [key, u] of Object.entries(FLOAT_KEYS)) {
    const v = params[key as keyof typeof FLOAT_KEYS];
    if (v !== undefined) uniforms[u].value = v;
  }
  for (const [key, u] of Object.entries(COLOR_KEYS)) {
    const v = params[key as keyof typeof COLOR_KEYS];
    if (v !== undefined) (uniforms[u].value as THREE.Color).set(v);
  }
}
