const THREE = window.THREE, PI = Math.PI;

const SoundFX = {
    ctx: null,
    init() { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} },
    _t(f, d, type, vol, delay) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const t = this.ctx.currentTime + (delay || 0);
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(Math.min(vol || 0.3, 0.5), t);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g);
        g.connect(this.ctx.destination);
        o.start(t);
        o.stop(t + d);
    },
    charge(p) { this._t(180 + p * 700, 0.04, 'sine', 0.06); },
    jump() { this._t(420, 0.1, 'sine', 0.15);
        this._t(640, 0.08, 'triangle', 0.1, 0.04); },
    land() { this._t(280, 0.15, 'triangle', 0.2); },
    perfect() { this._t(523, 0.08, 'sine', 0.15);
        this._t(659, 0.08, 'sine', 0.12, 0.08);
        this._t(784, 0.12, 'sine', 0.12, 0.16); },
    fail() { this._t(380, 0.12, 'sawtooth', 0.12);
        this._t(190, 0.25, 'sawtooth', 0.12, 0.12); },
};

const CFG = {
    platformMinDist: 1.5, platformMaxDist: 3.0, platformSize: 1.4, platformHeight: 0.35,
    jumpMinDist: 0.3, jumpMaxDist: 8.0, powerRate: 0.4, chargeSquash: 0.55,
    perfectRadius: 0.30, camFollowSpeed: 3.5, camOffset: new THREE.Vector3(-5, 6, 5),
    difficultyScale: 0.008, fallThreshold: -8,
};

const PALETTE = [0x4FC3F7, 0x81C784, 0xFFB74D, 0xE57373, 0xBA68C8, 0x4DB6AC, 0xFF8A65, 0x26C6DA, 0x7986CB, 0xF06292, 0xAED581, 0xFFD54F];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 120);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.bias = 0.0005;
document.getElementById('game-container').appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0x87CEEB, 0x3a7bd5, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xFFF5E6, 1.0);
sun.position.set(6, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.width = 512;
sun.shadow.mapSize.height = 512;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 25;
sun.shadow.camera.left = -10;
sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10;
sun.shadow.camera.bottom = -10;
sun.shadow.bias = 0.002;
scene.add(sun);
const amb = new THREE.AmbientLight(0x506080, 0.35);
scene.add(amb);

const clock = new THREE.Clock();
let state = 'SELECT', charType = 0;
let score = 0, bestScore = parseInt(localStorage.getItem('jumpjoy_best')) || 0, power = 0;
let streak = 0, multiplier = 1, hasRevived = false;
let platforms = [], curIdx = 0;
let character, characterBody, headMesh, arrowHelper, bodyY = 0.36, headY = 0.52;
let jumpData = null, fallData = null, particles = [];

function lerp(a, b, t) { return a + (b - a) * t; }

// ==================== CITY BACKGROUNDS ====================

const CITIES = ['东京','巴黎','纽约','上海','香港','迪拜','伦敦','悉尼','新加坡','旧金山','曼谷','巴塞罗那','柏林','首尔'];
const CITY_FILES = ['tokyo','paris','newyork','shanghai','hongkong','dubai','london','sydney','singapore','sanfran','bangkok','barcelona','berlin','seoul'];
let curCity = 0;
const cityTex = [];

function setCityTheme(idx) {
    curCity = idx;
    scene.background = cityTex[idx];
    scene.fog = new THREE.Fog(new THREE.Color(CITY_THEMES[idx].fog), 14, 28);
    document.getElementById('city-name').textContent = CITIES[idx];
    document.getElementById('city-name').style.display = 'block';
}

const CITY_THEMES = [
    { fog:0xD4536A, sky:['#FF6B35','#FFCC99','#FFE4B5'], stars:false },
    { fog:0x9C6BB5, sky:['#6A1B9A','#CE93D8','#F3E5F5'], stars:false },
    { fog:0x4A6B9A, sky:['#1A237E','#5C6BC0','#BBDEFB'], stars:true },
    { fog:0x4A7A7A, sky:['#004D40','#26A69A','#E0F7FA'], stars:false },
    { fog:0x1A2A5A, sky:['#0D0D2B','#1A237E','#4A6BB5'], stars:true },
    { fog:0x9B7A4A, sky:['#BF360C','#FF8A65','#FFF3E0'], stars:false },
    { fog:0x7A6A5A, sky:['#4E342E','#8D6E63','#FFF8E1'], stars:false },
    { fog:0x6A9ABA, sky:['#0277BD','#4FC3F7','#E1F5FE'], stars:false },
    { fog:0x2A3A5A, sky:['#1A1A3A','#3949AB','#C5CAE9'], stars:true },
    { fog:0xC88A5A, sky:['#E65100','#FFB74D','#FFF3E0'], stars:false },
    { fog:0x6A3A5A, sky:['#4A1050','#D47B9A','#FFE0E6'], stars:true },
    { fog:0xA07A5A, sky:['#E85D2A','#FFB074','#FFF5E0'], stars:false },
    { fog:0x6A7A8A, sky:['#2C3A5A','#6A8AB5','#C5D5E8'], stars:false },
    { fog:0x4A5A7A, sky:['#1A2340','#5A6A9A','#A0B5D0'], stars:true },
];

function rngFn(seed){let s=seed;return function(){s=(s*9301+49297)%233280;return s/233280;}}

function drawFallbackCity(i, c) {
    const ct = CITY_THEMES[i];
    const W=1600, H=800; c.width=W; c.height=H;
    const cx = c.getContext('2d');
    const rnd=rngFn(i*137+42);
    const grd=cx.createLinearGradient(0,0,0,H);
    ct.sky.forEach((col,j)=>grd.addColorStop(j/(ct.sky.length-1),col));
    cx.fillStyle=grd; cx.fillRect(0,0,W,H);
    if(ct.stars) for(let s=0;s<120;s++){const x=rnd()*W,y=rnd()*H*0.4,r=0.5+rnd()*1.5;cx.fillStyle=`rgba(255,255,255,${0.2+rnd()*0.5})`;cx.beginPath();cx.arc(x,y,r,0,PI*2);cx.fill();}
    const my=100+rnd()*60;
    cx.fillStyle='rgba(255,255,220,0.15)';cx.beginPath();cx.arc(W*0.85,my,40,0,PI*2);cx.fill();
    cx.fillStyle='rgba(255,255,200,0.08)';cx.beginPath();cx.arc(W*0.85,my,60,0,PI*2);cx.fill();
    cx.fillStyle='rgba(255,255,180,0.9)';cx.beginPath();cx.arc(W*0.85,my,25,0,PI*2);cx.fill();
    const base=H*0.72;
    cx.fillStyle='rgba(0,0,0,0.12)';cx.fillRect(0,base,W,H-base);
    cx.fillStyle='rgba(0,0,0,0.22)';
    for(let k=0;k<28;k++){const bx=rnd()*W,bh=30+rnd()*(base-40),bw=25+rnd()*50;cx.fillRect(bx,base-bh,bw,bh);if(rnd()>0.5){cx.fillStyle='rgba(255,255,200,0.03)';for(let wy=base-bh+8;wy<base-4;wy+=10)cx.fillRect(bx+2,wy,bw-4,3);cx.fillStyle='rgba(0,0,0,0.22)';}}
    cx.fillStyle='rgba(0,0,0,0.35)';
    if(i===0){const tx=W*0.25|0;cx.fillRect(tx-4,base-180,8,180);cx.fillRect(tx-18,base-130,36,100);cx.beginPath();cx.moveTo(tx,base-220);cx.lineTo(tx-12,base-180);cx.lineTo(tx+12,base-180);cx.fill();cx.fillRect(tx-24,base-145,48,8);cx.fillRect(tx-20,base-158,40,6);cx.fillStyle='rgba(255,200,100,0.08)';cx.fillRect(tx-3,base-45,6,40);cx.fillStyle='rgba(0,0,0,0.35)';
    }else if(i===1){const ex=W*0.55|0;cx.beginPath();cx.moveTo(ex,base-240);cx.lineTo(ex-30,base);cx.lineTo(ex+30,base);cx.fill();for(let y=base-190;y<base-20;y+=45){const w=10+(base-y)/14;cx.fillRect(ex-w,y,w*2,4);}cx.fillStyle='rgba(0,0,0,0.2)';cx.beginPath();cx.moveTo(ex,base-270);cx.lineTo(ex-5,base-240);cx.lineTo(ex+5,base-240);cx.fill();cx.fillStyle='rgba(0,0,0,0.35)';
    }else if(i===2){const ex=W*0.15|0;cx.fillRect(ex-18,base-200,36,200);cx.fillRect(ex-24,base-165,48,20);cx.fillRect(ex-14,base-230,28,30);cx.fillRect(ex-7,base-270,14,40);cx.fillRect(ex-2,base-290,4,20);
    }else if(i===3){const ox=W*0.65|0;cx.fillRect(ox-5,base-200,10,200);cx.beginPath();cx.arc(ox,base-145,18,0,PI*2);cx.fill();cx.beginPath();cx.arc(ox,base-75,12,0,PI*2);cx.fill();cx.fillRect(ox+18,base-165,5,70);cx.fillStyle='rgba(255,200,100,0.06)';cx.beginPath();cx.arc(ox,base-145,12,0,PI*2);cx.fill();cx.beginPath();cx.arc(ox,base-75,7,0,PI*2);cx.fill();cx.fillStyle='rgba(0,0,0,0.35)';
    }else if(i===4){for(let k=0;k<35;k++){const bx=rnd()*W,bh=30+rnd()*(base-25),bww=10+rnd()*30;cx.fillRect(bx,base-bh,bww,bh);}
    }else if(i===5){const bx=W*0.7|0;cx.beginPath();cx.moveTo(bx,base-300);cx.lineTo(bx-15,base);cx.lineTo(bx+15,base);cx.fill();cx.fillRect(bx-22,base-50,44,12);cx.fillRect(bx-18,base-80,36,8);
    }else if(i===6){const bx=W*0.3|0;cx.fillRect(bx-14,base-160,28,160);cx.fillRect(bx-18,base-178,36,18);cx.fillRect(bx-11,base-198,22,20);cx.fillRect(bx-22,base-145,44,10);cx.fillStyle='rgba(255,220,150,0.06)';cx.fillRect(bx-7,base-170,14,14);cx.fillStyle='rgba(0,0,0,0.35)';
    }else if(i===7){const sx=W*0.45|0;for(let k=0;k<5;k++){const sw=20-k*3,sh=30+k*10;cx.beginPath();cx.moveTo(sx-k*10,base);cx.quadraticCurveTo(sx-k*14,base-sh,sx,base-sh-5);cx.lineTo(sx,base);cx.fill();}cx.fillRect(sx-40,base-30,80,8);
    }else if(i===8){const mx=W*0.6|0;cx.fillRect(mx-8,base-180,16,180);cx.fillRect(mx+20,base-160,12,160);cx.fillRect(mx-35,base-120,70,10);cx.fillRect(mx-2,base-190,28,8);cx.fillRect(mx-45,base-110,90,6);
    }else if(i===9){const gx=W*0.1|0,gx2=W*0.4|0;cx.fillRect(gx-4,base-170,8,170);cx.fillRect(gx2-4,base-170,8,170);cx.beginPath();cx.moveTo(gx,base-150);cx.lineTo(gx2,base-150);cx.lineWidth=4;cx.strokeStyle='rgba(0,0,0,0.3)';cx.stroke();cx.beginPath();cx.moveTo(gx,base-140);cx.quadraticCurveTo(gx+(gx2-gx)*0.3,base-100,(gx+gx2)/2,base-115);cx.lineWidth=2;cx.stroke();cx.beginPath();cx.moveTo(gx2,base-140);cx.quadraticCurveTo(gx2-(gx2-gx)*0.3,base-100,(gx+gx2)/2,base-115);cx.lineWidth=2;cx.stroke();
    }else if(i===10){/*Bangkok - temple roofs*/for(let k=0;k<30;k++){const bx=rnd()*W,bh=20+rnd()*(base-30),bww=8+rnd()*25;cx.fillRect(bx,base-bh,bww,bh);}const tx=W*0.3|0;cx.fillRect(tx-3,base-60,6,60);cx.beginPath();cx.moveTo(tx-12,base-60);cx.lineTo(tx,base-80);cx.lineTo(tx+12,base-60);cx.fill();
    }else if(i===11){/*Barcelona - sagrada outline*/const sx=W*0.5|0;for(let k=0;k<6;k++){const w=8-k,sh=60+k*12;cx.fillRect(sx-w,base-sh,w*2,sh);}cx.beginPath();cx.moveTo(sx-14,base-120);cx.lineTo(sx,base-140);cx.lineTo(sx+14,base-120);cx.fill();
    }else if(i===12){/*Berlin - tv tower*/const tx=W*0.4|0;cx.fillRect(tx-2,base-120,4,120);cx.beginPath();cx.arc(tx,base-100,8,0,PI*2);cx.fill();cx.fillRect(tx-8,base-130,16,40);
    }else if(i===13){/*Seoul - lotte tower + Namsan*/const lx=W*0.35|0;cx.fillRect(lx-4,base-180,8,180);cx.fillRect(lx-12,base-170,24,8);cx.fillRect(lx+25,base-120,6,120);cx.beginPath();cx.arc(lx+28,base-105,4,0,PI*2);cx.fill();
    }
    cx.fillStyle='rgba(255,255,255,0.12)';cx.font='18px sans-serif';cx.textAlign='right';
    cx.fillText(CITIES[i],W-20,H-20);
}

function preRenderCities(cb) {
    let loaded = 0;
    if (typeof CITY_DATA_URLS === 'undefined') {
        for (let i = 0; i < CITIES.length; i++) {
            const c = document.createElement('canvas');
            drawFallbackCity(i, c);
            cityTex[i] = new THREE.CanvasTexture(c);
            cityTex[i].minFilter = THREE.LinearFilter;
        }
        scene.background = cityTex[0];
        if (cb) setTimeout(cb, 0);
        return;
    }
    for (let i = 0; i < CITIES.length; i++) {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = Math.min(img.naturalHeight, Math.round(img.naturalHeight * 960 / img.naturalWidth));
            if (c.width > 1920) { c.width = 1920; c.height = Math.round(c.width * img.naturalHeight / img.naturalWidth); }
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            const tex = new THREE.CanvasTexture(c);
            tex.minFilter = THREE.LinearFilter;
            cityTex[i] = tex;
            if (loaded === 0) scene.background = tex;
            if (++loaded === CITIES.length && cb) setTimeout(cb, 0);
        };
        img.onerror = () => {
            const c = document.createElement('canvas');
            drawFallbackCity(i, c);
            cityTex[i] = new THREE.CanvasTexture(c);
            cityTex[i].minFilter = THREE.LinearFilter;
            if (loaded === 0) scene.background = cityTex[i];
            if (++loaded === CITIES.length && cb) setTimeout(cb, 0);
        };
        img.src = CITY_DATA_URLS[i];
    }
}

// ==================== CHARACTERS ====================

const CHAR_LIST = [];

function regChar(id, name, color, fn) {
    CHAR_LIST.push({ id, name, color, fn });
}

// --- 柯南 ---
regChar('conan', '柯南', 0x1565C0, () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.42, 10), new THREE.MeshStandardMaterial({ color: 0x1565C0, roughness: 0.35, emissive: 0x1565C0, emissiveIntensity: 0.08 }));
    body.position.y = 0.21; body.castShadow = true; g.add(body);
    const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.5 }));
    shirt.position.y = 0.26; g.add(shirt);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), new THREE.MeshStandardMaterial({ color: 0xFFE0B2, roughness: 0.2 }));
    head.position.y = 0.52; head.castShadow = true; g.add(head);
    // spiky hair
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x4E342E, roughness: 0.7 });
    const hairP = [[0.06,0.66,-0.08,-0.2,-0.4],[-0.06,0.66,-0.06,0.2,-0.4],[0,0.68,-0.12,0,-0.5],[0.10,0.64,-0.04,-0.3,-0.2],[-0.10,0.64,-0.04,0.3,-0.2]];
    for(const h of hairP){const m=new THREE.Mesh(new THREE.ConeGeometry(0.05,0.14,6),hairMat);m.position.set(h[0],h[1],h[2]);m.rotation.z=h[3];m.rotation.x=h[4];g.add(m);}
    // big glasses
    const rMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.5 });
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.02, 8, 10), rMat);
    r1.position.set(-0.09, 0.54, -0.16); r1.rotation.x = 0.2; g.add(r1);
    const r2 = r1.clone(); r2.position.set(0.09, 0.54, -0.16); g.add(r2);
    const br=new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.015), rMat);br.position.set(0, 0.54, -0.16);g.add(br);
    // eyes
    const eMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const el = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), eMat);
    el.position.set(-0.09, 0.53, -0.22); g.add(el);
    const er = el.clone(); er.position.set(0.09, 0.53, -0.22); g.add(er);
    // red bowtie (bigger, more visible)
    const btMat = new THREE.MeshStandardMaterial({ color: 0xD32F2F, emissive: 0xD32F2F, emissiveIntensity: 0.15 });
    const bt = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 4), btMat);
    bt.position.set(0, 0.30, -0.16); bt.rotation.x = 0.5; g.add(bt);
    const bt2 = bt.clone(); bt2.position.set(0, 0.30, -0.10); bt2.rotation.x = -0.5; g.add(bt2);
    return { group: g, bodyRef: body, headRef: head };
});

// --- 哆啦A梦 ---
regChar('doraemon', '哆啦A梦', 0x1565C0, () => {
    const g = new THREE.Group();
    const bGeo = new THREE.SphereGeometry(0.24, 12, 12);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x1976D2, roughness: 0.3, emissive: 0x1976D2, emissiveIntensity: 0.08 });
    const body = new THREE.Mesh(bGeo, bMat);
    body.scale.y = 0.85; body.position.y = 0.24; body.castShadow = true; g.add(body);
    // white belly
    const belMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.4 });
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), belMat);
    belly.position.set(0, 0.20, -0.18); belly.scale.set(0.9, 0.7, 0.3); g.add(belly);
    // pocket (half-circle)
    const pocket = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), belMat);
    pocket.position.set(0, 0.18, -0.24); pocket.scale.set(1, 0.6, 0.2); g.add(pocket);
    // blue head
    const head = body.clone(); head.position.y = 0.48; head.scale.set(0.9, 0.9, 0.9); g.add(head);
    // white face
    const fMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 });
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), fMat);
    face.position.set(0, 0.48, -0.22); face.scale.set(0.9, 0.8, 0.3); g.add(face);
    // red nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshStandardMaterial({ color: 0xE53935 }));
    nose.position.set(0, 0.50, -0.24); g.add(nose);
    // eyes
    const wMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
    const pMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const we = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), wMat);
    we.position.set(-0.07, 0.54, -0.22); we.scale.set(1.1, 0.8, 0.2); g.add(we);
    const we2 = we.clone(); we2.position.set(0.07, 0.54, -0.22); g.add(we2);
    const pe = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), pMat);
    pe.position.set(-0.07, 0.53, -0.24); g.add(pe);
    const pe2 = pe.clone(); pe2.position.set(0.07, 0.53, -0.24); g.add(pe2);
    // whiskers (3 each side)
    const wMat2 = new THREE.MeshStandardMaterial({ color: 0x333333 });
    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 3; i++) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.10, 4), wMat2);
            w.position.set(side * 0.16, 0.48 + i * 0.03, -0.18);
            w.rotation.z = side * 0.5; w.rotation.x = 0.1 * (i - 1);
            g.add(w);
        }
    }
    // yellow bell
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshStandardMaterial({ color: 0xFFD600, emissive: 0xFFD600, emissiveIntensity: 0.2 }));
    bell.position.set(0, 0.14, -0.18); g.add(bell);
    // red tail (small torus)
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.01, 6, 8), new THREE.MeshStandardMaterial({ color: 0xD32F2F }));
    tail.position.set(0, 0.04, 0.22); tail.rotation.x = 0.5; g.add(tail);
    return { group: g, bodyRef: body, headRef: body };
});

// --- 马里奥 ---
regChar('mario', '马里奥', 0xE53935, () => {
    const g = new THREE.Group();
    const bGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.38, 10);
    const bMat = new THREE.MeshStandardMaterial({ color: 0xE53935, roughness: 0.4, emissive: 0xE53935, emissiveIntensity: 0.08 });
    const body = new THREE.Mesh(bGeo, bMat);
    body.position.y = 0.19; body.castShadow = true; g.add(body);
    // overalls
    const oMat = new THREE.MeshStandardMaterial({ color: 0x1565C0, roughness: 0.5 });
    const over = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 0.16, 8), oMat);
    over.position.y = 0.10; g.add(over);
    // suspenders (two straps)
    const susMat = new THREE.MeshStandardMaterial({ color: 0x1565C0 });
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.10, 0.03), susMat);
    s1.position.set(-0.10, 0.18, -0.12); g.add(s1);
    const s2 = s1.clone(); s2.position.set(0.10, 0.18, -0.12); g.add(s2);
    // buttons
    const btnMat = new THREE.MeshStandardMaterial({ color: 0xFFD600 });
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), btnMat);
    btn.position.set(-0.10, 0.14, -0.14); g.add(btn);
    const btn2 = btn.clone(); btn2.position.set(0.10, 0.14, -0.14); g.add(btn2);
    // head
    const hMat = new THREE.MeshStandardMaterial({ color: 0xFFE0B2, roughness: 0.2 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), hMat);
    head.position.y = 0.46; head.castShadow = true; g.add(head);
    // hat with M
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xE53935, roughness: 0.4 });
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.06, 10), hatMat);
    hat.position.y = 0.56; g.add(hat);
    const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 0.08, 8), hatMat);
    hatTop.position.y = 0.63; g.add(hatTop);
    // M emblem on hat (glowing)
    const mMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xFFFFFF, emissiveIntensity: 0.2 });
    const m1=new THREE.Mesh(new THREE.BoxGeometry(0.018,0.03,0.015),mMat);m1.position.set(0,0.64,-0.16);g.add(m1);
    const m2=new THREE.Mesh(new THREE.BoxGeometry(0.018,0.02,0.015),mMat);m2.position.set(-0.025,0.64,-0.16);m2.rotation.z=0.4;g.add(m2);
    const m3=new THREE.Mesh(new THREE.BoxGeometry(0.018,0.02,0.015),mMat);m3.position.set(0.025,0.64,-0.16);m3.rotation.z=-0.4;g.add(m3);
    // mustache
    const muMat=new THREE.MeshStandardMaterial({color:0x4E342E,roughness:0.7});
    const mu1=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.025,0.03),muMat);mu1.position.set(-0.06,0.44,-0.16);mu1.rotation.z=0.3;g.add(mu1);
    const mu2=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.025,0.03),muMat);mu2.position.set(0.06,0.44,-0.16);mu2.rotation.z=-0.3;g.add(mu2);
    // eyes
    const eyeMat=new THREE.MeshStandardMaterial({color:0x222222});
    const ey1=new THREE.Mesh(new THREE.SphereGeometry(0.02,6,6),eyeMat);ey1.position.set(-0.07,0.50,-0.16);g.add(ey1);
    const ey2=new THREE.Mesh(new THREE.SphereGeometry(0.02,6,6),eyeMat);ey2.position.set(0.07,0.50,-0.16);g.add(ey2);
    // shoes
    const shMat = new THREE.MeshStandardMaterial({ color: 0x5D4037, roughness: 0.7 });
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), shMat);
    sh.position.set(-0.08, 0.03, 0.02); sh.scale.set(0.9, 0.5, 1.2); g.add(sh);
    const sh2 = sh.clone(); sh2.position.set(0.08, 0.03, 0.02); g.add(sh2);
    return { group: g, bodyRef: body, headRef: head };
});

// --- 皮卡丘 ---
regChar('pikachu', '皮卡丘', 0xFFD600, () => {
    const g = new THREE.Group();
    const yMat = new THREE.MeshStandardMaterial({ color: 0xFFD600, roughness: 0.3, emissive: 0xFFD600, emissiveIntensity: 0.1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.38, 12), yMat);
    body.position.y = 0.19; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), yMat);
    head.position.y = 0.44; head.castShadow = true; g.add(head);
    // ears (black-tipped)
    const bkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 6), yMat);
    ear.position.set(-0.14, 0.60, -0.02); ear.rotation.z = 0.3; ear.rotation.x = -0.2; g.add(ear);
    const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 6), bkMat);
    t1.position.set(-0.16, 0.68, -0.04); t1.rotation.z = 0.3; t1.rotation.x = -0.2; g.add(t1);
    const ear2 = ear.clone(); ear2.position.set(0.14, 0.60, -0.02); ear2.rotation.z = -0.3; g.add(ear2);
    const t2 = t1.clone(); t2.position.set(0.16, 0.68, -0.04); t2.rotation.z = -0.3; g.add(t2);
    // cheeks (glowing red)
    const cMat = new THREE.MeshStandardMaterial({ color: 0xE53935, emissive: 0xE53935, emissiveIntensity: 0.35 });
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), cMat);
    c1.position.set(-0.13, 0.40, -0.16); g.add(c1);
    const c2 = c1.clone(); c2.position.set(0.13, 0.40, -0.16); g.add(c2);
    // eyes
    const eMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const ee = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), eMat);
    ee.position.set(-0.07, 0.47, -0.17); g.add(ee);
    const ee2 = ee.clone(); ee2.position.set(0.07, 0.47, -0.17); g.add(ee2);
    // lightning tail
    const tbMat = new THREE.MeshStandardMaterial({ color: 0xFFD600, roughness: 0.3 });
    const tseg1 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.025), tbMat);
    tseg1.position.set(0.15, 0.12, 0.08); tseg1.rotation.x = -0.3; g.add(tseg1);
    const tseg2 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.07, 0.025), tbMat);
    tseg2.position.set(0.14, 0.18, 0.16); tseg2.rotation.x = 0.4; g.add(tseg2);
    const tseg3 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.025), tbMat);
    tseg3.position.set(0.12, 0.13, 0.24); tseg3.rotation.x = -0.3; g.add(tseg3);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.06, 0.025), new THREE.MeshStandardMaterial({ color: 0x8D6E63 }));
    tip.position.set(0.11, 0.11, 0.32); tip.rotation.x = 0.2; g.add(tip);
    // feet
    const fMat = new THREE.MeshStandardMaterial({ color: 0xFFD600 });
    const f1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), fMat);
    f1.position.set(-0.10, 0.03, 0.04); f1.scale.set(0.9, 0.5, 1.1); g.add(f1);
    const f2 = f1.clone(); f2.position.set(0.10, 0.03, 0.04); g.add(f2);
    return { group: g, bodyRef: body, headRef: head };
});

// --- 索尼克 ---
regChar('sonic', '索尼克', 0x1565C0, () => {
    const g = new THREE.Group();
    const bMat = new THREE.MeshStandardMaterial({ color: 0x0D47A1, roughness: 0.3, emissive: 0x0D47A1, emissiveIntensity: 0.08 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), bMat);
    body.scale.set(0.9, 0.8, 0.7); body.position.y = 0.20; body.castShadow = true; g.add(body);
    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), bMat);
    head.position.y = 0.42; head.castShadow = true; g.add(head);
    // peach skin face
    const skMat = new THREE.MeshStandardMaterial({ color: 0xFFCCBC, roughness: 0.3 });
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 8), skMat);
    face.position.set(0, 0.42, -0.15); face.scale.set(1, 0.8, 0.3); g.add(face);
    // eyes (green)
    const gMat = new THREE.MeshStandardMaterial({ color: 0x66BB6A, emissive: 0x66BB6A, emissiveIntensity: 0.1 });
    const ge = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), gMat);
    ge.position.set(-0.07, 0.46, -0.18); g.add(ge);
    const ge2 = ge.clone(); ge2.position.set(0.07, 0.46, -0.18); g.add(ge2);
    // pupils
    const pMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const pp = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), pMat);
    pp.position.set(-0.07, 0.46, -0.20); g.add(pp);
    const pp2 = pp.clone(); pp2.position.set(0.07, 0.46, -0.20); g.add(pp2);
    // many spikes (8 cones)
    const sMat = new THREE.MeshStandardMaterial({ color: 0x0D47A1, roughness: 0.4 });
    const spikes = [[0,0.56,-0.06,0,-0.3],[-0.12,0.53,-0.04,0.4,-0.2],[0.12,0.53,-0.04,-0.4,-0.2],[-0.06,0.55,0.08,0.2,0.4],[0.06,0.55,0.08,-0.2,0.4],[-0.14,0.50,0.00,0.5,-0.1],[0.14,0.50,0.00,-0.5,-0.1],[0,0.48,0.14,0,0.5]];
    for (const s of spikes){const sp=new THREE.Mesh(new THREE.ConeGeometry(0.05,0.14,5),sMat);sp.position.set(s[0],s[1],s[2]);sp.rotation.z=s[3];sp.rotation.x=s[4];g.add(sp);}
    // shoes with white stripes
    const shMat = new THREE.MeshStandardMaterial({ color: 0xD32F2F, roughness: 0.5 });
    const sh1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), shMat);
    sh1.position.set(-0.08, 0.04, 0.04); sh1.scale.set(1, 0.5, 1.3); g.add(sh1);
    const sh2 = sh1.clone(); sh2.position.set(0.08, 0.04, 0.04); g.add(sh2);
    const stMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
    const st1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.06), stMat);
    st1.position.set(-0.08, 0.03, 0.09); g.add(st1);
    const st2 = st1.clone(); st2.position.set(0.08, 0.03, 0.09); g.add(st2);
    // white gloves
    const glMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 });
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), glMat);
    gl.position.set(-0.14, 0.18, -0.10); g.add(gl);
    const gl2 = gl.clone(); gl2.position.set(0.14, 0.18, -0.10); g.add(gl2);
    return { group: g, bodyRef: body, headRef: head };
});

// --- Hello Kitty ---
regChar('kitty', 'Kitty', 0xFF8A80, () => {
    const g = new THREE.Group();
    const wMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3, emissive: 0xFFFFFF, emissiveIntensity: 0.05 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.36, 10), wMat);
    body.position.y = 0.18; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), wMat);
    head.position.y = 0.44; head.castShadow = true; g.add(head);
    // ears with pink inside
    const eMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 });
    const e1 = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 6), eMat);
    e1.position.set(-0.10, 0.58, -0.06); e1.rotation.x = -0.3; g.add(e1);
    const e2 = e1.clone(); e2.position.set(0.10, 0.58, -0.06); e2.rotation.x = -0.3; g.add(e2);
    const piMat = new THREE.MeshStandardMaterial({ color: 0xFFCDD2 });
    const pi = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.04, 6), piMat);
    pi.position.set(-0.10, 0.56, -0.07); pi.rotation.x = -0.3; g.add(pi);
    const pi2 = pi.clone(); pi2.position.set(0.10, 0.56, -0.07); g.add(pi2);
    // eyes
    const eMat2 = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const ee = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), eMat2);
    ee.position.set(-0.07, 0.48, -0.17); g.add(ee);
    const ee2 = ee.clone(); ee2.position.set(0.07, 0.48, -0.17); g.add(ee2);
    // nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), new THREE.MeshStandardMaterial({ color: 0xFFD600 }));
    nose.position.set(0, 0.44, -0.17); g.add(nose);
    // whiskers
    const whMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 2; i++) {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.10, 4), whMat);
            w.position.set(side * 0.15, 0.44 + (i - 0.5) * 0.025, -0.16);
            w.rotation.z = side * 0.4; g.add(w);
        }
    }
    // big red bow (3D)
    const bMat = new THREE.MeshStandardMaterial({ color: 0xE53935, emissive: 0xE53935, emissiveIntensity: 0.15 });
    const b1=new THREE.Mesh(new THREE.BoxGeometry(0.10,0.025,0.03),bMat);b1.position.set(0.16,0.56,-0.06);b1.rotation.z=0.5;g.add(b1);
    const b2=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.025,0.03),bMat);b2.position.set(0.08,0.50,-0.06);b2.rotation.z=-0.4;g.add(b2);
    const b3=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.025,0.03),bMat);b3.position.set(0.20,0.50,-0.06);b3.rotation.z=0.6;g.add(b3);
    const b4=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.025,0.03),bMat);b4.position.set(0.04,0.56,-0.06);b4.rotation.z=-0.5;g.add(b4);
    const b5=new THREE.Mesh(new THREE.SphereGeometry(0.02,6,6),new THREE.MeshStandardMaterial({color:0xFFD600,emissive:0xFFD600,emissiveIntensity:0.15}));
    b5.position.set(0.12,0.53,-0.07);g.add(b5);
    // dress
    const dMat = new THREE.MeshStandardMaterial({ color: 0xFF8A80, roughness: 0.4 });
    const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.30, 0.10, 8), dMat);
    dress.position.y = 0.10; g.add(dress);
    // overalls button
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), new THREE.MeshStandardMaterial({ color: 0xFFD600 }));
    btn.position.set(0, 0.14, -0.12); g.add(btn);
    return { group: g, bodyRef: body, headRef: head };
});

// ==================== PLATFORMS ====================

let platRnd = rngFn(Date.now() % 99999 + 37);

function createPlatform(x, z, color, isBig) {
    const size = isBig ? 1.8 : (score >= 150 ? CFG.platformSize * 0.85 : CFG.platformSize);
    const h = isBig ? 0.55 : CFG.platformHeight;
    const c = new THREE.Color(color);
    const mat = new THREE.MeshStandardMaterial({ color: c.getHex(), roughness: 0.25, metalness: 0.05 });
    const type = isBig ? 0 : Math.floor(platRnd() * 4);
    let mesh, group = new THREE.Group();
    const hh = h / 2;
    if (type === 0) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), mat);
    } else if (type === 1) {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.55, size * 0.55, h, 16), mat);
    } else if (type === 2) {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(size, h, size), mat);
        const rimMat = new THREE.MeshStandardMaterial({ color: c.clone().offsetHSL(0, 0.1, 0.2).getHex(), emissive: c.getHex(), emissiveIntensity: 0.1 });
        const rim = new THREE.Mesh(new THREE.TorusGeometry(size * 0.55, 0.04, 6, 12), rimMat);
        rim.position.y = hh; rim.rotation.x = PI / 2; group.add(rim);
        const rim2 = new THREE.Mesh(new THREE.TorusGeometry(size * 0.55, 0.03, 6, 12), rimMat);
        rim2.position.y = -hh; rim2.rotation.x = PI / 2; group.add(rim2);
    } else {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.55, size * 0.55, h, 6), mat);
        const dotMat = new THREE.MeshStandardMaterial({ color: c.clone().offsetHSL(0, 0.2, 0.3).getHex(), emissive: c.getHex(), emissiveIntensity: 0.06 });
        for (let d = 0; d < 4; d++) {
            const a = d * PI / 2;
            const dot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), dotMat);
            dot.position.set(Math.cos(a) * size * 0.25, hh + 0.01, Math.sin(a) * size * 0.25);
            group.add(dot);
        }
    }
    mesh.position.set(0, hh, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (mesh) group.add(mesh);
    group.position.set(x, 0, z);
    scene.add(group);
    const hitRadius = (type === 0 || type === 2) ? size * 0.48 : size * 0.50;
    return { mesh: group, x, z, size, height: h, color: c.getHex(), hitRadius, type };
}

function isOnPlat(px, pz, plat) {
    const r = plat.hitRadius || plat.size * 0.48;
    if (plat.type === 1 || plat.type === 3) {
        return Math.sqrt((px - plat.x) ** 2 + (pz - plat.z) ** 2) < r;
    }
    return Math.abs(px - plat.x) < r && Math.abs(pz - plat.z) < r;
}

// ==================== GAME LOGIC ====================

function createStartPlats() {
    platforms = [];
    platforms.push(createPlatform(0, 0, 0x90CAF9, true));
    genNextPlat();
    if (character) {
        const p = platforms[0];
        character.position.set(p.x, p.height, p.z);
        character.rotation.set(0, 0, 0);
        characterBody.position.y = bodyY;
        characterBody.scale.set(1, 1, 1);
        if (headMesh && headMesh !== characterBody) headMesh.position.y = headY;
    }
    if (platforms.length > 1) updateArrow(platforms[0], platforms[1]);
}

function genNextPlat() {
    const last = platforms[platforms.length - 1];
    const dir = Math.random() > 0.5 ? 'x' : 'z';
    const ds = Math.min(1 + score * CFG.difficultyScale, 1.5);
    const hard = score >= 150 ? 0.35 : 0;
    const d = (CFG.platformMinDist + Math.random() * (CFG.platformMaxDist - CFG.platformMinDist)) * Math.min(ds + hard, 1.85);
    let nx = last.x, nz = last.z;
    if (dir === 'x') nx += d;
    else nz += d;
    const col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    platforms.push(createPlatform(nx, nz, col, false));
}

function updateArrow(from, to) {
    if (arrowHelper) { scene.remove(arrowHelper);
        arrowHelper = null; }
    if (!from || !to) return;
    const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    const len = dir.length();
    if (len < 0.01) return;
    dir.normalize();
    arrowHelper = new THREE.ArrowHelper(dir, new THREE.Vector3(from.x, 0.5, from.z), len * 0.85, to.color, 0.5, 0.25);
    arrowHelper.line.material.opacity = 0.7;
    arrowHelper.line.material.transparent = true;
    arrowHelper.cone.material.opacity = 0.9;
    arrowHelper.cone.material.transparent = true;
    scene.add(arrowHelper);
}

function startCharge() {
    if (state !== 'IDLE') return;
    state = 'CHARGING';
    power = 0;
    document.getElementById('power-bg').style.display = 'block';
    document.getElementById('power-fill').style.width = '0%';
}

function updateCharge(dt) {
    if (state !== 'CHARGING') return;
    power = Math.min(power + CFG.powerRate * dt, 1.0);
    document.getElementById('power-fill').style.width = (power * 100) + '%';
    const s = 1 - (1 - CFG.chargeSquash) * power;
    characterBody.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    characterBody.position.y = bodyY * s;
    if (headMesh && headMesh !== characterBody) headMesh.position.y = headY * s;
    if (Math.random() < dt * 10) SoundFX.charge(power);
}

function releaseJump() {
    if (state !== 'CHARGING') return;
    state = 'JUMPING';
    document.getElementById('power-bg').style.display = 'none';
    SoundFX.jump();
    const cur = platforms[curIdx],
        nxt = platforms[curIdx + 1];
    if (!nxt) return;
    const totalD = Math.sqrt((nxt.x - cur.x) ** 2 + (nxt.z - cur.z) ** 2);
    const jumpD = CFG.jumpMinDist + power * (CFG.jumpMaxDist - CFG.jumpMinDist);
    const t = Math.min(jumpD / totalD, 2.0);
    const mh = 0.6 + Math.min(totalD * 0.4, 2.0);
    const dur = 0.2 + totalD * 0.07;
    characterBody.scale.set(1, 1, 1);
    characterBody.position.y = bodyY;
    if (headMesh && headMesh !== characterBody) headMesh.position.y = headY;
    jumpData = { sx: cur.x, sz: cur.z, sh: cur.height, tx: cur.x + (nxt.x - cur.x) * t, tz: cur.z + (nxt.z - cur.z) * t, mh, dur, el: 0, nxt };
    if (arrowHelper) { scene.remove(arrowHelper);
        arrowHelper = null; }
}

function updateJump(dt) {
    if (state !== 'JUMPING' || !jumpData) return;
    jumpData.el += dt;
    const t = Math.min(jumpData.el / jumpData.dur, 1.0);
    const x = lerp(jumpData.sx, jumpData.tx, t);
    const z = lerp(jumpData.sz, jumpData.tz, t);
    const y = jumpData.sh + 4 * jumpData.mh * t * (1 - t);
    character.position.set(x, y, z);
    character.rotation.y = t * PI * 0.4;
    character.rotation.x = Math.sin(t * PI) * 0.12;
    if (t >= 1) {
        let landed = null, landDist = Infinity;
        for (let i = curIdx + 1; i < platforms.length; i++) {
            const p = platforms[i];
            if (isOnPlat(x, z, p)) {
                const d = Math.sqrt((x - p.x) ** 2 + (z - p.z) ** 2);
                if (d < landDist) { landed = p; landDist = d; }
            }
        }
        if (landed) onLand(landed, landDist);
        else onMiss();
    }
}

function onLand(plat, dist) {
    character.position.y = plat.height;
    character.rotation.set(0, 0, 0);
    characterBody.position.y = bodyY;
    characterBody.scale.set(1, 1, 1);
    if (headMesh && headMesh !== characterBody) headMesh.position.y = headY;
    curIdx = platforms.indexOf(plat);
    streak++;
    multiplier = streak >= 6 ? 3 : streak >= 3 ? 2 : 1;
    let pts = 1 * multiplier;
    const perfect = dist < CFG.perfectRadius;
    if (perfect) {
        pts++;
        spawnParticles(plat.x, 0.4, plat.z, plat.color, 40, true);
        spawnParticles(plat.x, 0.4, plat.z, 0xFFD700, 30, true);
        spawnParticles(plat.x, 0.4, plat.z, 0xFF6B6B, 20, true);
        SoundFX.perfect();
        const msgs = ['完美!','太棒了!','厉害!','漂亮!'];
        spawnText(plat.x, 1.2, plat.z, msgs[Math.floor(Math.random() * msgs.length)], '#FFD700', 34);
    } else { spawnParticles(plat.x, 0.4, plat.z, plat.color, 20, false); SoundFX.land(); }
    if (streak === 3) spawnText(plat.x, 0.8, plat.z, '连击x2!', '#4FC3F7', 26);
    else if (streak === 6) spawnText(plat.x, 1.0, plat.z, '超神连击x3!', '#FF6F00', 30);
    else if (streak === 10) spawnText(plat.x, 1.2, plat.z, '不可思议!', '#E53935', 36);
    score += pts;
    document.getElementById('score').textContent = score;
    const multEl = document.getElementById('multiplier');
    if (multiplier > 1) { multEl.textContent = 'x' + multiplier; multEl.style.display = 'block'; clearTimeout(window._mt); window._mt = setTimeout(() => { multEl.style.display = 'none'; }, 2000); }
    else { multEl.style.display = 'none'; }
    document.getElementById('combo').textContent = streak + '连';
    document.getElementById('combo').style.opacity = '1';
    clearTimeout(window._ct);
    window._ct = setTimeout(() => { document.getElementById('combo').style.opacity = '0'; }, 1200);
    if (score > 0 && score % 6 === 0) {
        let nxt; do { nxt = Math.floor(Math.random() * CITIES.length); } while (nxt === curCity);
        setCityTheme(nxt);
    }
    state = 'IDLE';
    jumpData = null;
    while (platforms.length <= curIdx + 2) genNextPlat();
    if (platforms[curIdx + 1]) updateArrow(platforms[curIdx], platforms[curIdx + 1]);
}

function onMiss() {
    if (!hasRevived) {
        hasRevived = true;
        streak = 0; multiplier = 1;
        const cur = platforms[curIdx];
        if (cur) {
            character.position.set(cur.x, cur.height, cur.z);
            character.rotation.set(0, 0, 0);
            characterBody.position.y = bodyY; characterBody.scale.set(1, 1, 1);
            if (headMesh && headMesh !== characterBody) headMesh.position.y = headY;
        }
        state = 'IDLE'; jumpData = null;
        document.getElementById('revive-overlay').style.display = 'flex';
        return;
    }
    state = 'FALLING'; jumpData = null; streak = 0; multiplier = 1;
    SoundFX.fail();
    fallData = { sy: character.position.y, ty: character.position.y - 6, dur: 0.8, el: 0 };
}

function showGameOver() {
    if (score > bestScore) { bestScore = score;
        try { localStorage.setItem('jumpjoy_best', bestScore.toString()); } catch (e) {} }
    document.getElementById('final-score').textContent = score;
    document.getElementById('best-final').textContent = bestScore;
    document.getElementById('best-score').textContent = '最高分: ' + bestScore;
    document.getElementById('game-over').style.display = 'flex';
}

function spawnParticles(x, y, z, color, count, isPerfect) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const cols = new Float32Array(count * 3);
    const vel = [];
    const bc = new THREE.Color(color);
    const colors = isPerfect ? [0xFFD700, 0xFF6B6B, 0x4FC3F7, 0x81C784, 0xFFB74D, 0xBA68C8] : null;
    for (let i = 0; i < count; i++) {
        const i3 = i * 3; const a = Math.random() * PI * 2, speed = 1 + Math.random() * (isPerfect ? 4 : 2);
        pos[i3] = x + (Math.random() - 0.5) * 0.3;
        pos[i3 + 1] = y + Math.random() * 0.3;
        pos[i3 + 2] = z + (Math.random() - 0.5) * 0.3;
        const c = colors ? new THREE.Color(colors[Math.floor(Math.random() * colors.length)]) : bc.clone().offsetHSL((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.15);
        cols[i3] = c.r; cols[i3 + 1] = c.g; cols[i3 + 2] = c.b;
        vel.push({ x: Math.cos(a) * speed * 0.8, y: 1.5 + Math.random() * (isPerfect ? 4 : 3), z: Math.sin(a) * speed * 0.8 });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: isPerfect ? 0.12 : 0.08, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    scene.add(pts);
    particles.push({ pts, vel, life: isPerfect ? 1.4 : 1.0, count });
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt * 1.2;
        if (p.life <= 0) { scene.remove(p.pts);
            p.pts.geometry.dispose();
            p.pts.material.dispose();
            particles.splice(i, 1); continue; }
        const a = p.pts.geometry.attributes.position.array;
        for (let j = 0; j < p.count; j++) {
            const j3 = j * 3;
            a[j3] += p.vel[j].x * dt;
            a[j3 + 1] += p.vel[j].y * dt;
            a[j3 + 2] += p.vel[j].z * dt;
            p.vel[j].y -= 3.5 * dt;
        }
        p.pts.geometry.attributes.position.needsUpdate = true;
        p.pts.material.opacity = Math.max(0, p.life);
    }
}

// ==================== SCORE EFFECTS ====================

let textPopups = [];

function makeTextSprite(msg, color, size) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 80;
    const cx = c.getContext('2d');
    const grd = cx.createRadialGradient(128, 40, 0, 128, 40, 120);
    grd.addColorStop(0, 'rgba(0,0,0,0.6)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = grd; cx.fillRect(0, 0, 256, 80);
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.shadowColor = 'rgba(0,0,0,0.5)'; cx.shadowBlur = 8;
    cx.font = 'bold ' + (size || 32) + 'px "Microsoft YaHei", sans-serif';
    cx.fillStyle = color || '#FFD700';
    cx.fillText(msg, 128, 42);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
}

function spawnText(x, y, z, msg, color, size) {
    const s = makeTextSprite(msg, color, size);
    s.position.set(x, y, z);
    s.scale.set(1.6, 0.5, 1);
    scene.add(s);
    textPopups.push({ sprite: s, life: 1.2, maxLife: 1.2, vy: 0.8 });
}

function updateTextPopups(dt) {
    for (let i = textPopups.length - 1; i >= 0; i--) {
        const t = textPopups[i];
        t.life -= dt;
        if (t.life <= 0) { scene.remove(t.sprite); t.sprite.material.map.dispose(); t.sprite.material.dispose(); textPopups.splice(i, 1); continue; }
        t.sprite.position.y += t.vy * dt;
        t.sprite.material.opacity = Math.min(1, t.life / t.maxLife * 2);
        t.sprite.scale.x += dt * 0.3;
        t.sprite.scale.y += dt * 0.1;
    }
}

// ==================== DYNAMIC BACKGROUND ====================

let bgGroup, cloudMesh, cloudMesh2, scanMesh, scanMesh2, dotGrid, dataStream;

function initDynamicBg() {
    bgGroup = new THREE.Group();
    scene.add(bgGroup);
    // --- Tech clouds (cyan glow) ---
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const cx = c.getContext('2d');
    const rng = rngFn(99);
    for (let i = 0; i < 24; i++) {
        const x = rng() * 480, y = rng() * 100, r = 20 + rng() * 60;
        const grd = cx.createRadialGradient(x + r * 0.2, y + r * 0.2, 0, x + r * 0.5, y + r * 0.5, r);
        grd.addColorStop(0, 'rgba(0,220,255,0.50)');
        grd.addColorStop(0.4, 'rgba(0,180,255,0.18)');
        grd.addColorStop(1, 'rgba(0,150,255,0)');
        cx.fillStyle = grd;
        cx.beginPath(); cx.arc(x, y, r, 0, PI * 2); cx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending });
    cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), mat);
    cloudMesh.position.set(0, 5, -12);
    bgGroup.add(cloudMesh);
    const tex2 = tex.clone(); tex2.repeat.set(3, 1.5);
    const mat2 = new THREE.MeshBasicMaterial({ map: tex2, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending });
    cloudMesh2 = new THREE.Mesh(new THREE.PlaneGeometry(70, 12), mat2);
    cloudMesh2.position.set(0, 8, -18);
    bgGroup.add(cloudMesh2);

    // --- Scan line overlay (horizontal bright bar that moves vertically) ---
    const sc = document.createElement('canvas');
    sc.width = 8; sc.height = 256;
    const scx = sc.getContext('2d');
    const sgrd = scx.createLinearGradient(0, 0, 0, 256);
    sgrd.addColorStop(0, 'rgba(0,180,255,0)');
    sgrd.addColorStop(0.35, 'rgba(0,180,255,0)');
    sgrd.addColorStop(0.45, 'rgba(0,220,255,0.3)');
    sgrd.addColorStop(0.48, 'rgba(100,255,255,0.7)');
    sgrd.addColorStop(0.5, 'rgba(180,255,255,1.0)');
    sgrd.addColorStop(0.52, 'rgba(100,255,255,0.7)');
    sgrd.addColorStop(0.55, 'rgba(0,220,255,0.3)');
    sgrd.addColorStop(0.65, 'rgba(0,180,255,0)');
    sgrd.addColorStop(1, 'rgba(0,180,255,0)');
    scx.fillStyle = sgrd; scx.fillRect(0, 0, 8, 256);
    const scanTex = new THREE.CanvasTexture(sc);
    scanTex.wrapS = scanTex.wrapT = THREE.RepeatWrapping;
    scanTex.repeat.set(1, 1);
    const scanMat = new THREE.MeshBasicMaterial({ map: scanTex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    scanMesh = new THREE.Mesh(new THREE.PlaneGeometry(50, 30), scanMat);
    scanMesh.position.set(0, 0, -9);
    bgGroup.add(scanMesh);
    // secondary scan line (slower, wider, different angle)
    const sc2 = document.createElement('canvas');
    sc2.width = 8; sc2.height = 200;
    const scx2 = sc2.getContext('2d');
    const sgrd2 = scx2.createLinearGradient(0, 0, 0, 200);
    sgrd2.addColorStop(0, 'rgba(255,100,200,0)');
    sgrd2.addColorStop(0.42, 'rgba(255,100,200,0)');
    sgrd2.addColorStop(0.48, 'rgba(255,150,220,0.5)');
    sgrd2.addColorStop(0.5, 'rgba(255,200,255,1.0)');
    sgrd2.addColorStop(0.52, 'rgba(255,150,220,0.5)');
    sgrd2.addColorStop(0.58, 'rgba(255,100,200,0)');
    sgrd2.addColorStop(1, 'rgba(255,100,200,0)');
    scx2.fillStyle = sgrd2; scx2.fillRect(0, 0, 8, 200);
    const scanTex2 = new THREE.CanvasTexture(sc2);
    scanTex2.wrapS = scanTex2.wrapT = THREE.RepeatWrapping;
    const scanMat2 = scanMat.clone(); scanMat2.map = scanTex2; scanMat2.opacity = 0.35;
    scanMesh2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), scanMat2);
    scanMesh2.position.set(0, -2, -10);
    scanMesh2.rotation.y = 0.05;
    bgGroup.add(scanMesh2);

    // --- Dot grid (neon grid intersections) ---
    const dotCount = 80;
    const dg = new THREE.BufferGeometry();
    const dp = new Float32Array(dotCount * 3);
    const dc = new Float32Array(dotCount * 3);
    for (let i = 0; i < dotCount; i++) {
        dp[i*3] = (Math.random() - 0.5) * 40;
        dp[i*3+1] = Math.random() * 12;
        dp[i*3+2] = (Math.random() - 0.5) * 20 - 10;
        const hue = 0.55 + Math.random() * 0.15; // cyan to blue
        const col = new THREE.Color().setHSL(hue, 0.8, 0.5 + Math.random() * 0.4);
        dc[i*3] = col.r; dc[i*3+1] = col.g; dc[i*3+2] = col.b;
    }
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
    dotGrid = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    dotGrid.userData = { baseSize: 0.08, phase: Math.random() * PI * 2 };
    bgGroup.add(dotGrid);

    // --- Data stream particles (upward moving dots) ---
    const dsCount = 120;
    const dsg = new THREE.BufferGeometry();
    const dsp = new Float32Array(dsCount * 3);
    const dsc = new Float32Array(dsCount * 3);
    for (let i = 0; i < dsCount; i++) {
        dsp[i*3] = (Math.random() - 0.5) * 45;
        dsp[i*3+1] = Math.random() * 14;
        dsp[i*3+2] = (Math.random() - 0.5) * 20 - 10;
        const hue = 0.5 + Math.random() * 0.2;
        const col = new THREE.Color().setHSL(hue, 1.0, 0.5 + Math.random() * 0.5);
        dsc[i*3] = col.r; dsc[i*3+1] = col.g; dsc[i*3+2] = col.b;
    }
    dsg.setAttribute('position', new THREE.BufferAttribute(dsp, 3));
    dsg.setAttribute('color', new THREE.BufferAttribute(dsc, 3));
    dataStream = new THREE.Points(dsg, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    bgGroup.add(dataStream);
}

function updateDynamicBg(dt, time) {
    if (bgGroup && camera) {
        bgGroup.position.x = camera.position.x;
        bgGroup.position.z = camera.position.z;
    }
    if (cloudMesh) { cloudMesh.material.map.offset.x += dt * 0.02; }
    if (cloudMesh2) { cloudMesh2.material.map.offset.x += dt * 0.008; cloudMesh2.material.map.offset.y += dt * 0.003; }
    if (scanMesh) { scanMesh.material.map.offset.y += dt * 0.04; }
    if (scanMesh2) { scanMesh2.material.map.offset.y += dt * 0.02; }
    if (dotGrid) {
        const a = dotGrid.geometry.attributes.position.array;
        for (let i = 0; i < a.length; i += 3) {
            a[i+1] += Math.sin(time * 0.5 + i * 0.3) * dt * 0.01;
            if (a[i+1] > 11) a[i+1] = 1; if (a[i+1] < 1) a[i+1] = 11;
        }
        dotGrid.geometry.attributes.position.needsUpdate = true;
        const pulse = 0.5 + Math.sin(time * 1.5 + dotGrid.userData.phase) * 0.5;
        dotGrid.material.size = dotGrid.userData.baseSize * (0.6 + pulse * 0.4);
        dotGrid.material.opacity = 0.15 + pulse * 0.25;
    }
    if (dataStream) {
        const a = dataStream.geometry.attributes.position.array;
        for (let i = 0; i < a.length; i += 3) {
            a[i+1] += dt * (0.4 + ((i % 5) * 0.1));
            a[i] += Math.sin(time + i * 0.5) * dt * 0.03;
            if (a[i+1] > 13) { a[i+1] = 0.5; a[i] = (Math.random() - 0.5) * 45; }
            if (a[i] > 22) a[i] = -22; if (a[i] < -22) a[i] = 22;
        }
        dataStream.geometry.attributes.position.needsUpdate = true;
    }
}

// ==================== CAMERA ====================

let camPos = new THREE.Vector3(-5, 6, 5);
let camLook = new THREE.Vector3(0, 0.3, 0);

function updateCamera(dt) {
    const target = character ? character.position : new THREE.Vector3(0, 0, 0);
    const want = new THREE.Vector3(target.x + CFG.camOffset.x, CFG.camOffset.y, target.z + CFG.camOffset.z);
    const f = Math.min(1, CFG.camFollowSpeed * dt);
    camPos.lerp(want, f);
    camera.position.copy(camPos);
    const lt = new THREE.Vector3(target.x, 0.3, target.z);
    camLook.lerp(lt, f);
    camera.lookAt(camLook);
}

// ==================== UI ====================

function buildCharSelect() {
    const grid = document.getElementById('char-grid');
    CHAR_LIST.forEach((ch, i) => {
        const d = document.createElement('div');
        d.className = 'char-opt';
        const inner = document.createElement('div');
        inner.className = 'inner';
        inner.style.background = '#' + new THREE.Color(ch.color).getHexString();
        d.appendChild(inner);
        const label = document.createElement('span');
        label.className = 'char-label';
        label.textContent = ch.name;
        d.appendChild(label);
        if (i === 0) d.style.borderColor = 'rgba(255,255,255,0.5)';
        d.addEventListener('click', () => selectChar(i));
        grid.appendChild(d);
    });
}

function selectChar(idx) {
    if (state !== 'SELECT') return;
    if (platforms.length > 0) {
        for (const p of platforms) { scene.remove(p.mesh);
            p.mesh.traverse(function(n){if(n.isMesh){n.geometry&&n.geometry.dispose();n.material&&n.material.dispose();}}); }
        platforms = [];
        for (const p of particles) { scene.remove(p.pts);
            p.pts.geometry.dispose(); p.pts.material.dispose(); }
        particles = [];
        if (arrowHelper) { scene.remove(arrowHelper); arrowHelper = null; }
        score = 0; streak = 0; multiplier = 1; hasRevived = false;
        curIdx = 0; curCity = 0;
        document.getElementById('score').textContent = '0';
        document.getElementById('combo').style.opacity = '0';
        document.getElementById('multiplier').style.display = 'none';
    }
    rebuildCharacter(idx);
    charType = idx;
    document.getElementById('char-select').style.display = 'none';
    document.getElementById('tip').style.display = 'block';
    state = 'IDLE';
    createStartPlats();
    setCityTheme(0);
    camera.position.set(-5, 6, 5);
    camera.lookAt(0, 0, 0);
    camPos.set(-5, 6, 5);
    camLook.set(0, 0.3, 0);
    SoundFX.ensure();
}

function rebuildCharacter(idx) {
    if (character) {
        character.traverse(c => { if (c.isMesh) { c.geometry && c.geometry.dispose();
                c.material && c.material.dispose(); } });
        scene.remove(character);
    }
    const result = CHAR_LIST[idx].fn();
    character = result.group;
    characterBody = result.bodyRef;
    headMesh = result.headRef || null;
    bodyY = characterBody.position.y;
    headY = headMesh && headMesh !== characterBody ? headMesh.position.y : bodyY;
    scene.add(character);
    if (platforms.length > 0) {
        const p = platforms[0];
        character.position.set(p.x, p.height, p.z);
        character.rotation.set(0, 0, 0);
    }
}

function restart() {
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('score').textContent = '0';
    document.getElementById('combo').style.opacity = '0';
    score = 0; streak = 0; multiplier = 1; hasRevived = false;
    power = 0; curIdx = 0; curCity = 0;
    state = 'IDLE'; jumpData = null; fallData = null;
    for (const p of platforms) { scene.remove(p.mesh);
        p.mesh.traverse(function (n) { if (n.isMesh) { n.geometry && n.geometry.dispose(); n.material && n.material.dispose(); } }); }
    platforms = [];
    for (const p of particles) { scene.remove(p.pts);
        p.pts.geometry.dispose();
        p.pts.material.dispose(); }
    particles = [];
    if (arrowHelper) { scene.remove(arrowHelper);
        arrowHelper = null; }
    setCityTheme(0);
    createStartPlats();
    camera.position.set(-5, 6, 5);
    camera.lookAt(0, 0, 0);
    camPos.set(-5, 6, 5);
    camLook.set(0, 0.3, 0);
}

// ==================== EVENTS ====================

function onDown(e) { e.preventDefault(); if (state === 'IDLE') startCharge(); }

function onUp(e) { e.preventDefault(); if (state === 'CHARGING') releaseJump(); }

function onKey(e) {
    if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (document.getElementById('revive-overlay').style.display === 'flex') return;
        if (document.getElementById('game-over').style.display === 'flex') return;
        if (e.type === 'keydown' && state === 'IDLE') startCharge();
        if (e.type === 'keyup' && state === 'CHARGING') releaseJump();
    }
}

function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==================== INIT ====================

function init() {
    SoundFX.init();
    buildCharSelect();
    document.getElementById('restart-btn').addEventListener('click', () => { if (state === 'GAME_OVER') restart(); });
    document.getElementById('char-select-btn').addEventListener('click', () => {
        if (state !== 'GAME_OVER') return;
        document.getElementById('game-over').style.display = 'none';
        document.getElementById('char-select').style.display = 'flex';
        state = 'SELECT';
    });
    document.getElementById('rv-yes').addEventListener('click', () => { document.getElementById('revive-overlay').style.display = 'none'; document.getElementById('combo').style.opacity = '0'; document.getElementById('multiplier').style.display = 'none'; });
    document.getElementById('rv-no').addEventListener('click', () => { document.getElementById('revive-overlay').style.display = 'none'; onMiss(); });
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    renderer.domElement.addEventListener('mousedown', onDown);
    renderer.domElement.addEventListener('mouseup', onUp);
    renderer.domElement.addEventListener('touchstart', onDown, { passive: false });
    renderer.domElement.addEventListener('touchend', onUp, { passive: false });
    preRenderCities(startGame);
}

function startGame() {
    setCityTheme(0);
    rebuildCharacter(0);
    createStartPlats();
    initDynamicBg();
    camera.position.set(-5, 6, 5);
    camera.lookAt(0, 0, 0);
    camPos.set(-5, 6, 5);
    document.getElementById('best-score').textContent = '最高分: ' + bestScore;
    document.getElementById('tip').style.display = 'none';
}

// ==================== LOOP ====================

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (state === 'CHARGING') updateCharge(dt);
    if (state === 'JUMPING') updateJump(dt);
    if (state === 'FALLING' && fallData) {
        fallData.el += dt;
        const t = Math.min(fallData.el / fallData.dur, 1);
        character.position.y = lerp(fallData.sy, fallData.ty, t * t);
        character.rotation.x += 0.05;
        if (t >= 1) { state = 'GAME_OVER';
            fallData = null;
            showGameOver(); }
    }
    if (state === 'SELECT' && character) {
        const bob = Math.sin(clock.elapsedTime * 1.5) * 0.02;
        characterBody.position.y = bodyY + bob;
        if (headMesh && headMesh !== characterBody) headMesh.position.y = headY + bob;
        character.rotation.y = PI * 0.75;
    }
    if (state === 'IDLE' && character) {
        const bob = Math.sin(clock.elapsedTime * 2.5) * 0.008;
        characterBody.position.y = bodyY + bob;
        if (headMesh && headMesh !== characterBody) headMesh.position.y = headY + bob;
        character.rotation.y += (PI * 0.75 - character.rotation.y) * dt * 2;
    }
    updateDynamicBg(dt, clock.elapsedTime);
    updateCamera(dt);
    updateParticles(dt);
    updateTextPopups(dt);
    renderer.render(scene, camera);
}

init();
animate();
