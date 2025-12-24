import * as THREE from 'three'

export class Environment {
  group: THREE.Group
  private stars: THREE.Points
  private moon: THREE.Mesh
  private sleighGroup: THREE.Group
  private snowSystem: THREE.Points
  private snowGeo: THREE.BufferGeometry
  private snowVelocities: Float32Array
  private time = 0

  constructor() {
    this.group = new THREE.Group()

    // 1. Stars (Enhanced)
    const starGeo = new THREE.BufferGeometry()
    const starCount = 1500
    const posArray = new Float32Array(starCount * 3)
    const sizeArray = new Float32Array(starCount)
    const colorArray = new Float32Array(starCount * 3)
    
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 0.5) // Upper hemisphere mostly
      const r = 50 + Math.random() * 100
      
      posArray[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      posArray[i * 3 + 1] = r * Math.cos(phi)
      posArray[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      
      sizeArray[i] = 0.5 + Math.random() * 2.0
      
      // Slight color variation (blue/white/yellow)
      const c = new THREE.Color()
      const variant = Math.random()
      if (variant > 0.9) c.setHex(0xffd700) // Gold
      else if (variant > 0.7) c.setHex(0x88ccff) // Blue
      else c.setHex(0xffffff) // White
      
      colorArray[i * 3] = c.r
      colorArray[i * 3 + 1] = c.g
      colorArray[i * 3 + 2] = c.b
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3))
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizeArray, 1))
    starGeo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3))
    
    const starMat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.3,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true
    })
    this.stars = new THREE.Points(starGeo, starMat)
    this.group.add(this.stars)

    // 2. Moon (Enhanced)
    const moonGeo = new THREE.SphereGeometry(3, 64, 64)
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xfff8e1,
      emissive: 0xfff8e1,
      emissiveIntensity: 0.8, // Increased for Bloom
      roughness: 0.8
    })
    this.moon = new THREE.Mesh(moonGeo, moonMat)
    this.moon.position.set(-20, 25, -25)
    this.group.add(this.moon)

    // 3. Flying Sleigh
    this.sleighGroup = this.createSleigh()
    this.group.add(this.sleighGroup)

    // 4. Falling Snow System
    const snowCount = 2000
    this.snowGeo = new THREE.BufferGeometry()
    const snowPos = new Float32Array(snowCount * 3)
    this.snowVelocities = new Float32Array(snowCount)
    
    for(let i=0; i<snowCount; i++) {
      snowPos[i*3] = (Math.random() - 0.5) * 50
      snowPos[i*3+1] = Math.random() * 30
      snowPos[i*3+2] = (Math.random() - 0.5) * 50
      this.snowVelocities[i] = 1 + Math.random() * 2 // Fall speed
    }
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3))
    const snowMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true
    })
    this.snowSystem = new THREE.Points(this.snowGeo, snowMat)
    this.group.add(this.snowSystem)
  }

  update(dt: number) {
    this.time += dt

    // Sleigh animation: Figure-8 path overhead
    const t = this.time * 0.15
    const r = 25
    const x = Math.sin(t) * r
    const z = Math.sin(t * 2) * (r * 0.6)
    const y = 20 + Math.cos(t * 1.5) * 2

    // Calculate tangent for rotation
    const dt_next = 0.1
    const t_next = t + dt_next * 0.15
    const x_next = Math.sin(t_next) * r
    const z_next = Math.sin(t_next * 2) * (r * 0.6)
    const y_next = 20 + Math.cos(t_next * 1.5) * 2

    this.sleighGroup.position.set(x, y, z)
    this.sleighGroup.lookAt(x_next, y_next, z_next)
    
    // Add a bit of wobble
    this.sleighGroup.rotation.z += Math.sin(this.time * 3) * 0.05

    // Snow animation
    const positions = this.snowGeo.attributes.position.array as Float32Array
    for(let i=0; i<positions.length/3; i++) {
      positions[i*3+1] -= this.snowVelocities[i] * dt
      
      // Wobble x/z
      positions[i*3] += Math.sin(this.time + i) * dt * 0.5
      positions[i*3+2] += Math.cos(this.time + i*2) * dt * 0.5

      // Reset if below ground
      if (positions[i*3+1] < 0) {
        positions[i*3+1] = 30
        positions[i*3] = (Math.random() - 0.5) * 50
        positions[i*3+2] = (Math.random() - 0.5) * 50
      }
    }
    this.snowGeo.attributes.position.needsUpdate = true
  }

  private createSleigh() {
    const group = new THREE.Group()

    // Materials
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 })
    const redMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.6 })
    const deerMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 })
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 })

    // Sleigh Body
    const sleighBody = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.2), redMat)
    sleighBody.position.y = 0.4
    sleighBody.castShadow = true
    group.add(sleighBody)

    // Runners
    const runnerL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), woodMat)
    runnerL.position.set(0, 0, 0.5)
    group.add(runnerL)
    const runnerR = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.1), woodMat)
    runnerR.position.set(0, 0, -0.5)
    group.add(runnerR)

    // Reindeer (Simplified representation: 2 reindeer)
    for (let i = 0; i < 2; i++) {
      const deer = new THREE.Group()
      deer.position.set(3 + i * 2.5, 0, 0)
      
      // Body
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 4, 8), deerMat)
      body.rotation.z = Math.PI / 2
      body.position.y = 0.6
      deer.add(body)

      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25), deerMat)
      head.position.set(0.6, 1.1, 0)
      deer.add(head)

      // Nose (Rudolph leading)
      if (i === 1) {
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08), noseMat)
        nose.position.set(0.8, 1.1, 0)
        deer.add(nose)
      }

      // Legs (static for now, maybe add simple swing later if needed, but at distance it's fine)
      const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.6)
      const legFL = new THREE.Mesh(legGeo, deerMat)
      legFL.position.set(0.3, 0.3, 0.2)
      deer.add(legFL)
      const legFR = new THREE.Mesh(legGeo, deerMat)
      legFR.position.set(0.3, 0.3, -0.2)
      deer.add(legFR)
      const legBL = new THREE.Mesh(legGeo, deerMat)
      legBL.position.set(-0.3, 0.3, 0.2)
      deer.add(legBL)
      const legBR = new THREE.Mesh(legGeo, deerMat)
      legBR.position.set(-0.3, 0.3, -0.2)
      deer.add(legBR)

      // Antlers
      const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), woodMat)
      antler.position.set(0.6, 1.4, 0.15)
      antler.rotation.z = -0.3
      deer.add(antler)
      const antler2 = antler.clone()
      antler2.position.set(0.6, 1.4, -0.15)
      deer.add(antler2)

      // Reins
      const rein = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.5 + i * 2.5), woodMat)
      rein.rotation.z = Math.PI / 2
      rein.position.set(-(1.25 + i * 1.25), 0.8, 0)
      deer.add(rein)

      group.add(deer)
    }

    // Magic dust trail (simple particles behind sleigh)
    // For now, just a point light following the sleigh
    const trailLight = new THREE.PointLight(0xffd700, 2, 8)
    trailLight.position.set(-1, 1, 0)
    group.add(trailLight)

    return group
  }
}
