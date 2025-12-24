import * as THREE from 'three'
import type { DecorationState, DecorationType } from './constants'

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function hashSeed(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rand01(seed: number) {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return ((seed >>> 0) % 10000) / 10000
}

export class ChristmasTree {
  group: THREE.Group
  private decorations: Map<string, THREE.Object3D> = new Map()
  private time = 0
  private collider: THREE.Mesh
  private star: THREE.Mesh
  private starMat: THREE.MeshStandardMaterial
  private twinkle: THREE.InstancedMesh
  private twinkleMat: THREE.MeshStandardMaterial
  private garlandMat: THREE.MeshStandardMaterial

  private readonly decoYMin = 0.75 + 0.6
  private readonly decoYRange = 5.3
  private readonly baseRadius = 3.35
  private readonly topRadius = 0.6

  constructor() {
    this.group = new THREE.Group()

    // 1. Root / Stump
    const stumpGroup = new THREE.Group()
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 })
    
    // Main root flare
    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.9, 0.8, 10),
      barkMat
    )
    stump.position.y = 0.4
    stumpGroup.add(stump)
    
    // Extra root details
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2
      const root = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.25, 1.8, 5),
        barkMat
      )
      root.rotation.x = Math.PI / 2.5
      root.rotation.y = angle
      root.position.set(Math.sin(angle) * 0.5, 0.1, Math.cos(angle) * 0.5)
      stumpGroup.add(root)
    }
    
    this.group.add(stumpGroup)

    // 2. Trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.45, 2.4, 12),
      barkMat
    )
    trunk.position.y = 1.2 + 0.4 // Lifted up to match stump
    trunk.castShadow = true
    trunk.receiveShadow = true
    this.group.add(trunk)

    // 3. Foliage
    const greens = [
      new THREE.MeshStandardMaterial({ 
        color: 0x1b5e20, 
        roughness: 0.8, 
        metalness: 0.1,
        flatShading: true,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({ 
        color: 0x2e7d32, 
        roughness: 0.8, 
        metalness: 0.1,
        flatShading: true,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({ 
        color: 0x388e3c, 
        roughness: 0.8, 
        metalness: 0.1,
        flatShading: true,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      })
    ]
    
    // Shifted layers up to expose trunk
    const lift = 0.6
    const layers: { r: number; h: number; y: number; m: THREE.MeshStandardMaterial }[] = [
      { r: 3.4, h: 2.8, y: 1.8 + lift, m: greens[0] },
      { r: 2.8, h: 2.5, y: 2.55 + lift, m: greens[1] },
      { r: 2.2, h: 2.15, y: 3.25 + lift, m: greens[0] },
      { r: 1.6, h: 1.85, y: 3.95 + lift, m: greens[2] },
      { r: 1.0, h: 1.55, y: 4.6 + lift, m: greens[1] }
    ]
    for (let i = 0; i < layers.length; i++) {
      const it = layers[i]
      // Increase segments for spikier look
      const geo = new THREE.ConeGeometry(it.r, it.h, 64, 12)
      const pos = geo.attributes.position as THREE.BufferAttribute
      for (let vi = 0; vi < pos.count; vi++) {
        const x = pos.getX(vi)
        const y = pos.getY(vi)
        const z = pos.getZ(vi)
        const a = Math.atan2(z, x)
        const t = clamp01((y / it.h) + 0.5)
        // More aggressive wobble for branches
        const wobble = (Math.sin(a * 12 + i * 2.5) * 1.5 + Math.sin(a * 23 - i * 1.2)) * 0.06
        const s = 1 + wobble * (1 - t * 0.5)
        pos.setXYZ(vi, x * s, y, z * s)
      }
      pos.needsUpdate = true
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, it.m)
      mesh.position.y = it.y
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)

      // Adjusted snow to be more subtle
      const snow = new THREE.Mesh(
        new THREE.RingGeometry(it.r * 0.5, it.r * 0.85, 36),
        new THREE.MeshStandardMaterial({ 
          color: 0xf5fbff, 
          roughness: 0.9, 
          metalness: 0.1, 
          transparent: true, 
          opacity: 0.4,
          side: THREE.DoubleSide
        })
      )
      snow.rotation.x = -Math.PI / 2
      snow.position.y = it.y + it.h * 0.15
      this.group.add(snow)
    }

    const garlandCurve = this.makeGarlandCurve()
    const garlandGeo = new THREE.TubeGeometry(garlandCurve, 220, 0.055, 10, false)
    this.garlandMat = new THREE.MeshStandardMaterial({ color: 0xff445a, roughness: 0.5, metalness: 0.2, emissive: 0xff1e35, emissiveIntensity: 0.35 })
    const garland = new THREE.Mesh(garlandGeo, this.garlandMat)
    this.group.add(garland)

    this.twinkleMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.05,
      emissive: 0xffffff,
      emissiveIntensity: 1.15
    })
    const lightGeo = new THREE.SphereGeometry(0.06, 10, 10)
    const lightCount = 120
    this.twinkle = new THREE.InstancedMesh(lightGeo, this.twinkleMat, lightCount)
    for (let i = 0; i < lightCount; i++) {
      const t = i / lightCount
      const h = 0.08 + t * 0.92
      const y = this.decoYMin + h * this.decoYRange
      const angle = t * Math.PI * 2 * 5.5
      const r = this.radiusAtHeight(h) + 0.08
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r
      const m = new THREE.Matrix4().makeTranslation(x, y, z)
      this.twinkle.setMatrixAt(i, m)
      const c =
        i % 3 === 0 ? new THREE.Color(0xffc107) : i % 3 === 1 ? new THREE.Color(0x29b6f6) : new THREE.Color(0xff445a)
      this.twinkle.setColorAt(i, c)
    }
    this.twinkle.instanceMatrix.needsUpdate = true
    if (this.twinkle.instanceColor) this.twinkle.instanceColor.needsUpdate = true
    this.group.add(this.twinkle)

    this.starMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      roughness: 0.22,
      metalness: 0.85,
      emissive: 0xffcc33,
      emissiveIntensity: 0.85
    })
    this.star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), this.starMat)
    this.star.position.y = this.decoYMin + this.decoYRange + 0.95
    this.group.add(this.star)

    this.collider = new THREE.Mesh(
      new THREE.ConeGeometry(this.baseRadius * 0.98, this.decoYRange + 0.9, 18, 1, true),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    )
    this.collider.position.y = this.decoYMin + (this.decoYRange + 0.9) / 2 - 0.1
    this.group.add(this.collider)
  }

  update(dt: number) {
    this.time += dt
    const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(this.time * 2.2))
    this.starMat.emissiveIntensity = 0.75 + pulse * 0.65
    this.star.rotation.y += dt * 0.35

    this.twinkleMat.emissiveIntensity = 0.9 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * 3.2))
    this.garlandMat.emissiveIntensity = 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(this.time * 1.7))

    for (const obj of this.decorations.values()) {
      const t = obj.userData?.type as DecorationType | undefined
      const seed = (obj.userData?.seed as number | undefined) ?? 0
      const s = rand01(seed + Math.floor(this.time * 10))
      if (t === 'bell') {
        obj.rotation.z = Math.sin(this.time * 2.6 + seed * 0.001) * (0.25 + s * 0.1)
      } else if (t === 'mini_hat') {
        obj.rotation.y += dt * (0.6 + s * 0.4)
        obj.position.y += Math.sin(this.time * 3.2 + seed * 0.002) * 0.002
      } else if (t === 'tinsel') {
        obj.rotation.y += dt * (0.35 + s * 0.2)
      }
    }
  }

  updateFromSnapshot(decos: DecorationState[]) {
    const live = new Set(decos.map((d) => d.id))
    for (const [id, obj] of this.decorations.entries()) {
      if (!live.has(id)) {
        obj.removeFromParent()
        this.decorations.delete(id)
      }
    }

    for (const d of decos) {
      this.upsertDecoration(d)
    }
  }

  upsertDecoration(d: DecorationState) {
    let obj = this.decorations.get(d.id)
    if (!obj) {
      obj = this.createDecoration(d.id, d.type)
      this.group.add(obj)
      this.decorations.set(d.id, obj)
    }
    const r = this.radiusAtHeight(d.height)
    const y = this.decoYMin + d.height * this.decoYRange
    const x = Math.cos(d.angle) * r
    const z = Math.sin(d.angle) * r
    obj.position.set(x, y, z)
    obj.rotation.y = d.angle + Math.PI
  }

  private radiusAtHeight(h: number) {
    const t = clamp01(h)
    const r = this.topRadius + (this.baseRadius - this.topRadius) * (1 - t)
    return r * 0.74
  }

  intersect(raycaster: THREE.Raycaster) {
    const hits = raycaster.intersectObject(this.collider, false)
    return hits[0] ?? null
  }

  slotFromWorldPoint(point: THREE.Vector3) {
    const local = this.group.worldToLocal(point.clone())
    const angle = Math.atan2(local.z, local.x)
    const h = clamp01((local.y - this.decoYMin) / this.decoYRange)
    return { angle, height: h }
  }

  private makeGarlandCurve() {
    const pts: THREE.Vector3[] = []
    const turns = 5.5
    const steps = 90
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const h = 0.1 + t * 0.9
      const y = this.decoYMin + h * this.decoYRange
      const angle = t * Math.PI * 2 * turns
      const r = this.radiusAtHeight(h) + 0.14
      pts.push(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r))
    }
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.15)
  }

  private createDecoration(id: string, type: DecorationType) {
    const group = new THREE.Group()
    const seed = hashSeed(id)
    group.userData = { type, seed }
    if (type === 'bell') {
      const r = rand01(seed)
      const c = r < 0.33 ? 0xffc107 : r < 0.66 ? 0xff445a : 0x29b6f6
      const bell = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 16, 14),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.75, emissive: c, emissiveIntensity: 0.12 })
      )
      group.add(bell)
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, 0.08, 10),
        new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.8 })
      )
      cap.position.set(0, 0.14, 0)
      group.add(cap)
      const clapper = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x3b2b24, roughness: 0.9 })
      )
      clapper.position.set(0, -0.15, 0)
      group.add(clapper)
      return group
    }
    if (type === 'mini_hat') {
      const r = rand01(seed + 11)
      const c = r < 0.5 ? 0xd32f2f : 0x7b1fa2
      const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.34, 16),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, emissive: c, emissiveIntensity: 0.08 })
      )
      hat.position.y = 0.12
      group.add(hat)
      const pom = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.08 })
      )
      pom.position.set(0.12, 0.28, 0)
      group.add(pom)
      return group
    }
    const r = rand01(seed + 27)
    const c = r < 0.33 ? 0x29b6f6 : r < 0.66 ? 0xffc107 : 0x66ff9a
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.06, 12, 28),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.18, emissive: c, emissiveIntensity: 0.12 })
    )
    ring.rotation.x = Math.PI / 2
    group.add(ring)
    return group
  }
}
