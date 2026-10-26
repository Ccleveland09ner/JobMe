"use client";

/**
 * The sky: a gradient dome around the camera, zenith to horizon, with the low
 * sun's glow at dusk. Below the horizon it is the horizon colour, which is also
 * the fog's, so far ground fades into it. Drawn first, behind everything.
 */

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { skyLook } from "./look";

/** Inside the camera's far plane (120 m), which the dome's whole depth must be. */
export const DOME_RADIUS = 100;

/** Toward the setting sun: low, behind the building and to the left. */
const SUNSET_FROM = new THREE.Vector3(-0.75, 0.03, -0.66).normalize();

const domeGeometry = new THREE.SphereGeometry(DOME_RADIUS, 32, 16);

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform float uGlowStrength;
  uniform vec3 uSunset;
  varying vec3 vDirection;

  void main() {
    vec3 d = normalize(vDirection);
    float h = max(d.y, 0.0);
    // Horizon to mid over the lowest ~10 degrees, mid to zenith above.
    vec3 color = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
    color = mix(color, uZenith, smoothstep(0.18, 1.0, h));
    float toSun = max(dot(d, uSunset), 0.0);
    float glow = pow(toSun, 5.0) * (1.0 - smoothstep(0.0, 0.45, h)) * uGlowStrength;
    color = mix(color, uGlow, clamp(glow, 0.0, 1.0));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
    // A little noise against banding in the dark gradients.
    float noise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    gl_FragColor.rgb += (noise - 0.5) / 255.0;
  }
`;

export function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        // The look's colours, by reference: no copying each frame.
        uniforms: {
          uZenith: { value: skyLook.color.zenith },
          uMid: { value: skyLook.color.mid },
          uHorizon: { value: skyLook.color.horizon },
          uGlow: { value: skyLook.color.glow },
          uGlowStrength: { value: 0 },
          uSunset: { value: SUNSET_FROM },
        },
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const dome = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>>(null);
  useFrame(() => {
    if (dome.current) dome.current.material.uniforms.uGlowStrength.value = skyLook.value.glowStrength;
  });

  return <mesh ref={dome} geometry={domeGeometry} material={material} renderOrder={-1000} frustumCulled={false} />;
}
