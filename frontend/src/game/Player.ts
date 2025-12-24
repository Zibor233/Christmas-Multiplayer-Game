import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'

export class Player {
  private static usagiTemplatePromise: Promise<{ model: THREE.Group; clips: THREE.AnimationClip[]; height: number }> | null = null

  private static async getUsagiTemplate(): Promise<{ model: THREE.Group; clips: THREE.AnimationClip[]; height: number }> {
    if (Player.usagiTemplatePromise) return Player.usagiTemplatePromise
    Player.usagiTemplatePromise = (async () => {
      const modelUrl = new URL('../../../乌萨奇/WSQ.fbx', import.meta.url).toString()
      const textureUrl = new URL('../../../乌萨奇/Texture/wsq_basecolor .png', import.meta.url).toString()

      const loader = new FBXLoader()
      const fbx = await new Promise<THREE.Group>((resolve, reject) => {
        loader.load(modelUrl, resolve, undefined, reject)
      })

      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        new THREE.TextureLoader().load(textureUrl, resolve, undefined, reject)
      })
      texture.colorSpace = THREE.SRGBColorSpace

      fbx.traverse((obj) => {
        const anyObj: any = obj
        if (!anyObj.isMesh) return
        const mesh = obj as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of materials) {
          if (!m) continue
          ;(m as any).map = texture
          if ('color' in (m as any) && (m as any).color) {
            ;(m as any).color.setHex(0xffffff)
          }
          if ('emissive' in (m as any) && (m as any).emissive) {
            // Lower emissive intensity to prevent washing out details (eyes/mouth)
            ;(m as any).emissive.setHex(0xffffff)
            ;(m as any).emissiveIntensity = 0.05
          }
          if ('roughness' in (m as any)) {
            ;(m as any).roughness = 0.9
          }
          if ('metalness' in (m as any)) {
            ;(m as any).metalness = 0.0
          }
          ;(m as any).needsUpdate = true
        }
        mesh.castShadow = false
        mesh.receiveShadow = false
      })

      const box = new THREE.Box3().setFromObject(fbx)
      const size = box.getSize(new THREE.Vector3())
      const targetHeight = 1.45
      const s = size.y > 0.0001 ? targetHeight / size.y : 1
      fbx.scale.setScalar(s)
      const box2 = new THREE.Box3().setFromObject(fbx)
      const minY = box2.min.y
      if (Number.isFinite(minY)) fbx.position.y -= minY

      const box3 = new THREE.Box3().setFromObject(fbx)
      const h = box3.getSize(new THREE.Vector3()).y
      const clips = ((fbx as any).animations as THREE.AnimationClip[] | undefined) ?? []
      return { model: fbx, clips, height: h > 0.0001 ? h : 1.45 }
    })()
    return Player.usagiTemplatePromise
  }

  id: string
  name: string
  isLocal: boolean

  x = 0
  z = 0
  vx = 0
  vz = 0
  targetX = 0
  targetZ = 0
  hat = false
  placedCount = 0

  group: THREE.Group
  private fallbackBody: THREE.Mesh
  private localRing: THREE.Mesh
  private hatMesh: THREE.Mesh
  private nameSprite: THREE.Sprite
  private modelRoot: THREE.Object3D | null = null
  private modelBaseY = 0
  private animTime = 0
  private facingYaw = 0
  private lastAnimX = 0
  private lastAnimZ = 0
  private derivedSpeed = 0
  private mixer: THREE.AnimationMixer | null = null
  private idleAction: THREE.AnimationAction | null = null
  private walkAction: THREE.AnimationAction | null = null
  private activeAction: THREE.AnimationAction | null = null

  constructor(id: string, name: string, isLocal: boolean) {
    this.id = id
    this.name = name
    this.isLocal = isLocal

    this.group = new THREE.Group()

    this.fallbackBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.6, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.1 })
    )
    this.fallbackBody.position.y = 0.7
    this.fallbackBody.castShadow = true
    this.fallbackBody.receiveShadow = true
    this.group.add(this.fallbackBody)

    this.localRing = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.65, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    )
    this.localRing.rotation.x = -Math.PI / 2
    this.localRing.position.y = 0.02
    this.localRing.visible = isLocal
    this.group.add(this.localRing)

    this.hatMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.55, 16),
      new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.7, metalness: 0.05 })
    )
    this.hatMesh.position.set(0, 1.25, 0)
    this.hatMesh.visible = false
    this.hatMesh.castShadow = true
    this.hatMesh.receiveShadow = true
    this.group.add(this.hatMesh)

    const hatPompom = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.05 })
    )
    hatPompom.position.set(0.2, 1.48, 0)
    this.hatMesh.add(hatPompom)

    this.nameSprite = this.makeNameSprite(name)
    this.nameSprite.position.set(0, 1.8, 0)
    this.group.add(this.nameSprite)

    void Player.getUsagiTemplate()
      .then((template) => {
        if (this.modelRoot) return
        const cloned = skeletonClone(template.model) as THREE.Group
        this.modelRoot = cloned
        this.modelBaseY = cloned.position.y
        
        // Enable shadows for the character
        cloned.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = true
            obj.receiveShadow = true
          }
        })
        
        this.group.add(cloned)
        this.fallbackBody.visible = false

        const height = template.height
        this.hatMesh.position.set(0, height * 0.88, 0)
        this.nameSprite.position.set(0, height + 0.5, 0)

        if (template.clips.length > 0) {
          this.mixer = new THREE.AnimationMixer(cloned)
          const idleClip =
            template.clips.find((c) => c.name.toLowerCase().includes('idle')) ??
            template.clips.find((c) => c.name.toLowerCase().includes('stand')) ??
            null
          const walkClip =
            template.clips.find((c) => c.name.toLowerCase().includes('walk')) ??
            template.clips.find((c) => c.name.toLowerCase().includes('run')) ??
            template.clips[0]
          if (idleClip) this.idleAction = this.mixer.clipAction(idleClip)
          if (walkClip) this.walkAction = this.mixer.clipAction(walkClip)
          if (this.idleAction) {
            this.idleAction.play()
            this.activeAction = this.idleAction
          } else if (this.walkAction) {
            this.walkAction.play()
            this.activeAction = this.walkAction
          }
        }
      })
      .catch(() => {})
  }

  setHat(v: boolean) {
    this.hat = v
    this.hatMesh.visible = v
  }

  setTargetPosition(x: number, z: number) {
    this.targetX = x
    this.targetZ = z
  }

  applyInput(dt: number, axis: { x: number; z: number }, maxSpeed: number = 3.5) {
    const targetVx = axis.x * maxSpeed
    const targetVz = axis.z * maxSpeed
    
    // Inertia/Acceleration logic: Smoothly interpolate current velocity to target velocity
    const accelFactor = 8.0 // Responsiveness
    const lerp = Math.min(1, dt * accelFactor)
    
    this.vx += (targetVx - this.vx) * lerp
    this.vz += (targetVz - this.vz) * lerp

    this.x += this.vx * dt
    this.z += this.vz * dt
    this.updateMesh()
  }

  update(dt: number) {
    this.localRing.visible = this.isLocal
    if (!this.isLocal) {
      // Improved interpolation for remote players to reduce jitter
      const lerp = Math.min(1, dt * 8.0)
      this.x += (this.targetX - this.x) * lerp
      this.z += (this.targetZ - this.z) * lerp
      
      // Calculate velocity for animation
      const dx = this.targetX - this.x
      const dz = this.targetZ - this.z
      // Approximate velocity based on position delta for animation sync
      this.vx = dx * 5.0 
      this.vz = dz * 5.0
      
      this.updateMesh()
    }
    this.updateAnimation(dt)
  }

  updateMesh() {
    this.group.position.set(this.x, 0, this.z)
  }

  private updateAnimation(dt: number) {
    this.animTime += dt
    const dx = this.x - this.lastAnimX
    const dz = this.z - this.lastAnimZ
    this.lastAnimX = this.x
    this.lastAnimZ = this.z
    
    // Calculate actual speed
    let speed = 0
    if (dt > 0.000001) {
       this.derivedSpeed = Math.hypot(dx, dz) / dt
       // Smooth out derived speed to avoid animation flickering
       speed = this.derivedSpeed
    }
    
    // If local, we trust our vx/vz more for immediate feedback
    if (this.isLocal) {
        speed = Math.hypot(this.vx, this.vz)
    }

    const maxSpeed = 3.5
    const moveT = Math.min(1, speed / maxSpeed)

    // Smooth rotation
    if (speed > 0.1) {
      const targetYaw = Math.atan2(dx, dz) // Use actual movement direction
      // If local, use velocity for instant turning response
      const yawTarget = this.isLocal ? Math.atan2(this.vx, this.vz) : targetYaw
      
      const dy = ((yawTarget - this.facingYaw + Math.PI) % (Math.PI * 2)) - Math.PI
      // Slower turn for more weight
      this.facingYaw += dy * Math.min(1, dt * 8.0) 
      this.group.rotation.y = this.facingYaw
      
      // Banking (lean into turn)
      // If dy is positive (turning left), tilt left (z rotation positive?) - actually depends on coordinate system
      // Let's add a slight tilt based on turn rate
      const tilt = -dy * 0.15 // Lean magnitude
      // Smoothly apply tilt
      if (this.modelRoot) {
          this.modelRoot.rotation.z = THREE.MathUtils.lerp(this.modelRoot.rotation.z, tilt, dt * 5)
      }
    } else {
        // Return to upright when stopped
        if (this.modelRoot) {
            this.modelRoot.rotation.z = THREE.MathUtils.lerp(this.modelRoot.rotation.z, 0, dt * 5)
        }
    }
    
    // Forward tilt when moving fast
    if (this.modelRoot) {
        const forwardTilt = moveT * 0.15 // Lean forward up to ~8.5 degrees
        this.modelRoot.rotation.x = THREE.MathUtils.lerp(this.modelRoot.rotation.x, forwardTilt, dt * 5)
    }

    if (this.mixer) {
      this.mixer.update(dt)
      const wantWalk = moveT > 0.05
      const next = wantWalk ? this.walkAction : this.idleAction
      
      // Sync animation speed with movement speed to prevent foot skating
      if (this.walkAction) {
          // Base speed 1.0 roughly matches 2.5m/s in many animations, adjust factor as needed
          // If speed is 3.5, we want timeScale around 1.4-1.5
          const syncFactor = 0.4
          this.walkAction.timeScale = 0.5 + (speed * syncFactor)
      }

      if (next && next !== this.activeAction) {
        next.reset().play()
        if (this.activeAction) next.crossFadeFrom(this.activeAction, 0.25, false) // Longer fade for smoother transition
        this.activeAction = next
      }
      return
    }

    // Fallback procedural animation
    const bobA = 0.012 + moveT * 0.04
    const bobF = 1.7 + moveT * 6.0
    const bob = Math.sin(this.animTime * bobF * Math.PI * 2) * bobA
    const tilt = Math.sin(this.animTime * bobF * Math.PI * 2) * (0.03 + moveT * 0.09)
    if (this.modelRoot) {
      this.modelRoot.position.y = this.modelBaseY + bob
      this.modelRoot.rotation.x = -tilt
    } else {
      this.fallbackBody.position.y = 0.7 + bob
    }
    this.hatMesh.rotation.z = tilt * 0.5
  }

  private makeNameSprite(name: string) {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = 'bold 28px Microsoft YaHei'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'white'
    ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(2.2, 0.55, 1)
    return sprite
  }
}
