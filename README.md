# AEL Ωmega Particles v4

**100K+ GPU-accelerated 3D particles** powered by WebGPU compute shaders.

Built by **Ayman Elmasry** — AEL Digital Studio.

## Features

| Capability | Detail |
|---|---|
| **Engine** | WebGPU Compute + Render pipelines |
| **Particle Count** | Up to 100,000 particles at 144 FPS |
| **Physics** | Gravity, vortex, turbulence force fields (GPU-computed) |
| **Rendering** | 3D perspective with additive blending & glow |
| **Camera** | Orbit controls (drag to rotate, scroll to zoom, auto-rotate) |
| **Audio** | Microphone reactivity (bass → size, mid → speed) |
| **Color** | 6 themes: Neon, Fire, Aurora, Sunset, Ice, Lava |
| **Spawn Shapes** | Sphere, Cube, Ring, Galaxy |
| **Export** | Screenshot to PNG |

## Usage

Open `index.html` in any browser with WebGPU support:
- Chrome 113+, Edge 113+
- Safari 18+ (macOS 15+)
- Firefox Nightly

Click the gear button (bottom-right) to open the control panel.

## Technical Architecture

```
┌─────────────────────────────────────────────────┐
│                  JavaScript                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ OrbitCam │  │ AudioInp │  │ PanelControl  │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       └──────────┬──┴─────────┘                  │
│                  ▼                               │
│         OmegaParticleEngine                      │
│  ┌───────────────────────────────────────────┐   │
│  │              WebGPU Device                 │   │
│  │  ┌──────────────┐  ┌──────────────────┐   │   │
│  │  │ Compute Pass  │  │  Render Pass     │   │   │
│  │  │ (WGSL)        │→│ (WGSL + Blend)   │   │   │
│  │  │ physics tick  │  │ 3D billboard     │   │   │
│  │  │ force fields  │  │ glow particles   │   │   │
│  │  │ respawn logic │  │ alpha blending   │   │   │
│  │  └──────────────┘  └──────────────────┘   │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Particle Layout (WGSL)

| Field | Type | Bytes | Purpose |
|---|---|---|---|
| `pos` | `vec3f` | 12+4 | World position |
| `vel` | `vec3f` | 12+4 | Velocity vector |
| `color` | `vec4f` | 16 | RGBA color |
| `life` | `f32` | 4 | Remaining life |
| `maxLife` | `f32` | 4 | Initial life (for fading) |
| `size` | `f32` | 4 | Base particle size |

**Total:** 64 bytes per particle → 6.4 MB for 100K particles (GPU-resident).

## Build & Deploy

```bash
git clone https://github.com/aymanelmasryael/ael-omega-particles.git
cd ael-omega-particles
# No build step — open index.html directly
```

## Repository

- **GitHub:** https://github.com/aymanelmasryael/ael-omega-particles
- **Live:** https://aymanelmasryael.github.io/ael-omega-particles/
- **Author Site:** https://www.aymanelmasry.com

---

(c) 2026 **Ayman Elmasry** — AEL Digital Studio. All rights reserved.
