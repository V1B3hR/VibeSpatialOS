/**
 * VIBE SpatialOS - Holographic Volumetric Shader
 * Fresnel edge glow, dynamic scanlines, chromatic aberration, and holographic interference.
 */

import * as THREE from 'three';

export interface HologramShaderUniforms {
  [uniform: string]: THREE.IUniform<any>;
  time: { value: number };
  glowColor: { value: THREE.Color };
  baseColor: { value: THREE.Color };
  scanlineDensity: { value: number };
  fresnelPower: { value: number };
  opacity: { value: number };
}

export function createHologramMaterial(options?: {
  glowColor?: string | number;
  baseColor?: string | number;
  opacity?: number;
  fresnelPower?: number;
}): THREE.ShaderMaterial {
  const glow = new THREE.Color(options?.glowColor ?? 0x00f0ff);
  const base = new THREE.Color(options?.baseColor ?? 0x001122);
  const opacity = options?.opacity ?? 0.85;
  const fresnelPower = options?.fresnelPower ?? 2.5;

  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 },
      glowColor: { value: glow },
      baseColor: { value: base },
      scanlineDensity: { value: 60.0 },
      fresnelPower: { value: fresnelPower },
      opacity: { value: opacity }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 glowColor;
      uniform vec3 baseColor;
      uniform float scanlineDensity;
      uniform float fresnelPower;
      uniform float opacity;

      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      varying vec3 vWorldPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);

        // Fresnel Rim Glow
        float fresnel = 1.0 - max(0.0, dot(viewDir, normal));
        fresnel = pow(fresnel, fresnelPower);

        // Scanline modulation
        float scanline = sin((vWorldPosition.y + time * 0.15) * scanlineDensity) * 0.5 + 0.5;
        scanline = pow(scanline, 1.5) * 0.4 + 0.6;

        // Dynamic Interference flicker
        float flicker = 0.95 + 0.05 * sin(time * 25.0 + vWorldPosition.x * 10.0);

        // Color combination
        vec3 finalColor = mix(baseColor, glowColor, fresnel * 0.9 + 0.1);
        finalColor *= scanline * flicker;
        finalColor += glowColor * fresnel * 1.2;

        float alpha = (fresnel * 0.75 + 0.25) * opacity * scanline;
        gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}
