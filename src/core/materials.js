import * as THREE from 'three';
import { sharedUniforms, GLSL } from './glsl.js';

const FOG_VERTEX = /* glsl */ `
vec4 dhFogWorld = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  dhFogWorld = batchingMatrix * dhFogWorld;
#endif
#ifdef USE_INSTANCING
  dhFogWorld = instanceMatrix * dhFogWorld;
#endif
vDhWorldPos = ( modelMatrix * dhFogWorld ).xyz;
`;

export function patchFog(material, { onShader } = {}) {
  const additive = material.blending === THREE.AdditiveBlending;
  const userKey = onShader ? onShader.toString() : '';
  material.fog = false;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, sharedUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDhWorldPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${FOG_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDhWorldPos;\n${GLSL.envPars}\n${GLSL.fog}`)
      .replace(
        '#include <tonemapping_fragment>',
        `gl_FragColor.rgb = ${additive ? 'applyFogAdditive' : 'applyFog'}( gl_FragColor.rgb, vDhWorldPos );\n#include <tonemapping_fragment>`,
      );
    onShader?.(shader, renderer);
  };
  material.customProgramCacheKey = () => `dhfog${additive ? 'A' : ''}|${userKey}`;
  material.needsUpdate = true;
  return material;
}

export function createMaterials() {
  return {
    standard(params = {}, opts = {}) {
      return patchFog(new THREE.MeshStandardMaterial(params), opts);
    },
    physical(params = {}, opts = {}) {
      return patchFog(new THREE.MeshPhysicalMaterial(params), opts);
    },
    basic(params = {}, opts = {}) {
      return patchFog(new THREE.MeshBasicMaterial(params), opts);
    },
    glow(color, intensity = 3, params = {}) {
      const c = new THREE.Color(color).multiplyScalar(intensity);
      return patchFog(new THREE.MeshBasicMaterial({ color: c, ...params }));
    },
    shader({ uniforms = {}, ...params }) {
      return new THREE.ShaderMaterial({ ...params, uniforms: { ...sharedUniforms, ...uniforms } });
    },
    patchFog,
  };
}
