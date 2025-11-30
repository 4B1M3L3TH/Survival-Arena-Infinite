/** * --- CONFIGURACIÓN & MOTOR --- 
 */
const CANVAS = document.getElementById('gameCanvas');
const CTX = CANVAS.getContext('2d');

function resize() {
    CANVAS.width = window.innerWidth;
    CANVAS.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const Math2 = {
    rand: (min, max) => Math.random() * (max - min) + min,
    randInt: (min, max) => Math.floor(Math.random() * (max - min + 1) + min),
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    checkCircleCol: (a, b) => Math2.dist(a.pos.x, a.pos.y, b.pos.x, b.pos.y) < (a.radius + b.radius)
};

// Configuración de Dificultad
const DIFF_CONFIG = {
    normal: { id: 'NORMAL', hpMod: 1.0, dmgMod: 1.0, spawnAggro: 0, color: '#2ecc71', desc: "Stats estándar. Balanceado." },
    hard: { id: 'DIFÍCIL', hpMod: 1.5, dmgMod: 1.5, spawnAggro: 2, color: '#e67e22', desc: "Enemigos +50% Vida/Daño. Más hordas." },
    hardcore: { id: 'HARDCORE', hpMod: 2.5, dmgMod: 2.5, spawnAggro: 5, color: '#c0392b', desc: "Enemigos +150% Stats. Caos total." }
};

let currentDifficulty = 'normal';

const ui = {
    selectDiff: (mode, btn) => {
        currentDifficulty = mode;
        // Visual update
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const conf = DIFF_CONFIG[mode];
        const descEl = document.getElementById('diff-desc');
        descEl.innerText = conf.desc;
        descEl.style.color = conf.color;
    }
};

/**
 * --- CLASES ---
 */

class Entity {
    constructor(x, y, radius, color) {
        this.pos = { x, y };
        this.radius = radius;
        this.color = color;
        this.dead = false;
        this.pushback = { x: 0, y: 0 };
    }
    draw(ctx, cam) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.pos.x - cam.x, this.pos.y - cam.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    applyPhysics() {
        this.pos.x += this.pushback.x;
        this.pos.y += this.pushback.y;
        this.pushback.x *= 0.8;
        this.pushback.y *= 0.8;
    }
}

class Player extends Entity {
    constructor(cls) {
        super(0, 0, 15, '#3498db');
        this.stats = {
            maxHp: 100, hp: 100, speed: 4, damage: 1.0, attackSpeed: 1.0,
            range: 1.0, armor: 0, dodge: 0, lifesteal: 0, pickupRange: 120
        };

        // Clases
        if (cls === 'melee') { this.stats.maxHp = 150; this.stats.hp = 150; this.stats.armor = 3; this.stats.speed = 3.5; this.color = '#e74c3c'; }
        if (cls === 'mage') { this.stats.maxHp = 70; this.stats.hp = 70; this.stats.damage = 1.3; this.color = '#9b59b6'; }
        if (cls === 'heavy') { this.stats.speed = 3; this.stats.damage = 1.2; this.stats.attackSpeed = 1.2; this.color = '#e67e22'; }

        this.xp = 0;
        this.level = 1;
        this.nextLevelXp = 50;
        this.money = 0;
        this.weapons = [];
        this.invulnTimer = 0;
    }

    update() {
        let mx = 0, my = 0;
        if (keys['w'] || keys['arrowup']) my = -1;
        if (keys['s'] || keys['arrowdown']) my = 1;
        if (keys['a'] || keys['arrowleft']) mx = -1;
        if (keys['d'] || keys['arrowright']) mx = 1;

        if (joystick.active) { mx = joystick.x; my = joystick.y; }

        const mag = Math.hypot(mx, my);
        if (mag > 0.1) {
            mx /= mag; my /= mag;
            this.pos.x += mx * this.stats.speed;
            this.pos.y += my * this.stats.speed;
        }

        this.applyPhysics();
        if (this.invulnTimer > 0) this.invulnTimer--;

        if (game.frame % 120 === 0 && this.stats.hp < this.stats.maxHp) this.heal(1);

        this.weapons.forEach(w => w.update());
    }

    draw(ctx, cam) {
        const x = this.pos.x - cam.x;
        const y = this.pos.y - cam.y;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x, y + 10, 15, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        if (this.invulnTimer > 0 && Math.floor(Date.now() / 50) % 2 == 0) return;

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(x, y - 5, this.radius - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x - 5, y - 8, 3, 0, Math.PI * 2);
        ctx.arc(x + 5, y - 8, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    takeDamage(amount) {
        if (Math.random() * 100 < this.stats.dodge) {
            game.addText("MISS", this.pos.x, this.pos.y, '#aaa');
            return;
        }
        if (this.invulnTimer > 0) return;

        let dmg = Math.max(1, amount - this.stats.armor);
        this.stats.hp -= dmg;
        this.invulnTimer = 20;
        game.addText(`-${Math.floor(dmg)}`, this.pos.x, this.pos.y, '#e74c3c');
        game.shake = 5;

        if (this.stats.hp <= 0) game.gameOver();
    }

    heal(amount) {
        if (this.stats.hp >= this.stats.maxHp) return;
        this.stats.hp = Math.min(this.stats.hp + amount, this.stats.maxHp);
        game.addText(`+${amount}`, this.pos.x, this.pos.y, '#2ecc71');
    }

    gainXp(amount) {
        this.xp += amount;
        this.money += amount;
        if (this.xp >= this.nextLevelXp) {
            this.xp -= this.nextLevelXp;
            this.level++;
            this.nextLevelXp = Math.floor(this.nextLevelXp * 1.3);
            game.levelUp();
        }
    }
}

class Enemy extends Entity {
    constructor(type, playerPos) {
        super(0, 0, type.radius || 12, type.color || '#e74c3c');

        const angle = Math.random() * Math.PI * 2;
        const dist = Math.max(CANVAS.width, CANVAS.height) / 2 + 100;
        this.pos.x = playerPos.x + Math.cos(angle) * dist;
        this.pos.y = playerPos.y + Math.sin(angle) * dist;

        // APLICAR DIFICULTAD
        const diff = game.difficultySettings;

        this.hp = type.hp * (1 + game.wave * 0.2) * diff.hpMod;
        this.damage = type.damage * diff.dmgMod;
        this.speed = type.speed;
        this.value = type.value;
        this.emoji = type.emoji || '👾';
        this.ai = type.ai || 'chase';
        this.shootTimer = 0;
    }

    update() {
        const dx = game.player.pos.x - this.pos.x;
        const dy = game.player.pos.y - this.pos.y;
        const dist = Math.hypot(dx, dy);

        if (this.ai === 'chase') {
            if (dist > 0) {
                this.pos.x += (dx / dist) * this.speed;
                this.pos.y += (dy / dist) * this.speed;
            }
        } else if (this.ai === 'shooter') {
            const idealDist = 250;
            if (dist > idealDist + 20) {
                this.pos.x += (dx / dist) * this.speed;
                this.pos.y += (dy / dist) * this.speed;
            } else if (dist < idealDist - 20) {
                this.pos.x -= (dx / dist) * this.speed;
                this.pos.y -= (dy / dist) * this.speed;
            }
            this.shootTimer++;
            if (this.shootTimer > 120) {
                this.shootTimer = 0;
                game.projectiles.push(new Projectile(
                    this.pos.x, this.pos.y, (dx / dist) * 4, (dy / dist) * 4, this.damage, 100, 1, 0, true
                ));
            }
        }

        for (let other of game.enemies) {
            if (other === this) continue;
            if (Math.abs(this.pos.x - other.pos.x) > 50) continue;
            const d = Math2.dist(this.pos.x, this.pos.y, other.pos.x, other.pos.y);
            if (d < this.radius * 2) {
                const angle = Math.atan2(this.pos.y - other.pos.y, this.pos.x - other.pos.x);
                this.pos.x += Math.cos(angle) * 0.5;
                this.pos.y += Math.sin(angle) * 0.5;
            }
        }

        this.applyPhysics();

        if (Math2.checkCircleCol(this, game.player)) {
            game.player.takeDamage(this.damage);
            const angle = Math.atan2(dy, dx);
            this.pushback.x = -Math.cos(angle) * 10;
            this.pushback.y = -Math.sin(angle) * 10;
        }
    }

    hit(damage, sourcePos, knockbackForce) {
        this.hp -= damage;
        game.addText(Math.round(damage), this.pos.x, this.pos.y - 20, '#fff');
        this.flash = 3;

        if (sourcePos) {
            const angle = Math.atan2(this.pos.y - sourcePos.y, this.pos.x - sourcePos.x);
            this.pushback.x += Math.cos(angle) * knockbackForce;
            this.pushback.y += Math.sin(angle) * knockbackForce;
        }
        if (Math.random() * 100 < game.player.stats.lifesteal) game.player.heal(1);
        if (this.hp <= 0) {
            this.dead = true;
            game.spawnGem(this.pos.x, this.pos.y, this.value);
            game.kills++;
        }
    }

    draw(ctx, cam) {
        const x = this.pos.x - cam.x;
        const y = this.pos.y - cam.y;
        if (x < -50 || x > CANVAS.width + 50 || y < -50 || y > CANVAS.height + 50) return;

        if (this.flash > 0) {
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x, y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            this.flash--;
            ctx.globalAlpha = 1;
        } else {
            ctx.font = `${this.radius * 2}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.save();
            ctx.translate(x, y);
            if (game.player.pos.x < this.pos.x) ctx.scale(-1, 1);
            ctx.fillText(this.emoji, 0, 0);
            ctx.restore();
        }
    }
}

class Gem extends Entity {
    constructor(x, y, value) {
        super(x, y, 5, '#2ecc71');
        this.value = value;
        this.magnet = false;
    }
    update() {
        const dist = Math2.dist(this.pos.x, this.pos.y, game.player.pos.x, game.player.pos.y);
        if (dist < game.player.stats.pickupRange) this.magnet = true;

        if (this.magnet) {
            const angle = Math.atan2(game.player.pos.y - this.pos.y, game.player.pos.x - this.pos.x);
            const speed = 12;
            this.pos.x += Math.cos(angle) * speed;
            this.pos.y += Math.sin(angle) * speed;
            if (dist < game.player.radius + 10) {
                game.player.gainXp(this.value);
                this.dead = true;
            }
        }
    }
    draw(ctx, cam) {
        const x = this.pos.x - cam.x;
        const y = this.pos.y - cam.y;
        if (x < -20 || x > CANVAS.width + 20 || y < -20 || y > CANVAS.height + 20) return;
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x, y + 5);
        ctx.lineTo(x - 5, y);
        ctx.fill();
    }
}

class Projectile extends Entity {
    constructor(x, y, vx, vy, damage, duration, pierce, kb, isEnemy = false) {
        super(x, y, isEnemy ? 6 : 4, isEnemy ? '#e74c3c' : '#f1c40f');
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.duration = duration;
        this.pierce = pierce;
        this.kb = kb;
        this.isEnemy = isEnemy;
    }
    update() {
        this.pos.x += this.vx;
        this.pos.y += this.vy;
        this.duration--;
        if (this.duration <= 0) this.dead = true;

        if (this.isEnemy) {
            if (Math2.checkCircleCol(this, game.player)) {
                game.player.takeDamage(this.damage);
                this.dead = true;
            }
        } else {
            for (let e of game.enemies) {
                if (Math2.checkCircleCol(this, e)) {
                    e.hit(this.damage, this.pos, this.kb);
                    this.pierce--;
                    if (this.pierce <= 0) {
                        this.dead = true;
                        break;
                    }
                }
            }
        }
    }
    draw(ctx, cam) {
        const x = this.pos.x - cam.x;
        const y = this.pos.y - cam.y;
        if (x < -20 || x > CANVAS.width + 20 || y < -20 || y > CANVAS.height + 20) return;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(x, y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

class FloatingText {
    constructor(text, x, y, color) {
        this.text = text;
        this.pos = { x, y };
        this.color = color;
        this.life = 60;
        this.vy = -1;
    }
    update() {
        this.pos.y += this.vy;
        this.life--;
    }
    draw(ctx, cam) {
        ctx.globalAlpha = Math.max(0, this.life / 60);
        ctx.fillStyle = this.color;
        ctx.font = 'bold 16px Arial';
        ctx.fillText(this.text, this.pos.x - cam.x, this.pos.y - cam.y);
        ctx.globalAlpha = 1;
    }
}

class Weapon {
    constructor(def) {
        this.def = def;
        this.cooldown = 0;
        this.level = 1;
    }
    update() {
        if (this.cooldown > 0) this.cooldown--;
        else {
            const target = this.findTarget();
            if (target || this.def.noTarget) {
                this.fire(target);
                this.cooldown = this.def.baseCd * game.player.stats.attackSpeed;
            }
        }
    }
    findTarget() {
        let close = null, minDist = Infinity;
        const range = this.def.range * game.player.stats.range;
        for (let e of game.enemies) {
            const d = Math2.dist(game.player.pos.x, game.player.pos.y, e.pos.x, e.pos.y);
            if (d < range && d < minDist) {
                minDist = d;
                close = e;
            }
        }
        return close;
    }
    fire(target) {
        this.def.onFire(game.player.pos, target, this.getDmg());
    }
    getDmg() {
        return this.def.baseDmg * game.player.stats.damage * (1 + (this.level * 0.2));
    }
}

const ENEMIES_DB = {
    worm: { hp: 12, damage: 5, speed: 2.2, value: 1, emoji: '🐛', ai: 'chase' },
    beetle: { hp: 30, damage: 10, speed: 1.5, value: 2, emoji: '🐞', ai: 'chase' },
    bat: { hp: 10, damage: 15, speed: 3.5, value: 3, emoji: '🦇', ai: 'chase' },
    spider: { hp: 20, damage: 8, speed: 1.8, value: 2, emoji: '🕷️', ai: 'shooter' },
    ogre: { hp: 50, damage: 25, speed: 1.2, value: 5, emoji: '👹', ai: 'chase' },
    alien: { hp: 70, damage: 40, speed: 2.5, value: 4, emoji: '👾', ai: 'shooter' }
};

const WEAPONS_DB = {
    pistol: {
        name: "Pistola", baseCd: 35, baseDmg: 15, range: 350, icon: '🔫',
        onFire: (pos, target, dmg) => {
            const angle = Math.atan2(target.pos.y - pos.y, target.pos.x - pos.x);
            game.projectiles.push(new Projectile(pos.x, pos.y, Math.cos(angle) * 12, Math.sin(angle) * 12, dmg, 60, 1, 5));
        }
    },
    shotgun: {
        name: "Escopeta", baseCd: 60, baseDmg: 12, range: 250, icon: '🧨',
        onFire: (pos, target, dmg) => {
            const angle = Math.atan2(target.pos.y - pos.y, target.pos.x - pos.x);
            for (let i = -1; i <= 1; i++) {
                const a = angle + (i * 0.25);
                game.projectiles.push(new Projectile(pos.x, pos.y, Math.cos(a) * 10, Math.sin(a) * 10, dmg, 30, 2, 8));
            }
        }
    },
    garlic: {
        name: "Campo de Fuerza", baseCd: 20, baseDmg: 6, range: 90, noTarget: true, icon: '🔵',
        onFire: (pos, target, dmg) => {
            const r = 90 * game.player.stats.range;
            game.tempEffects.push({ x: pos.x, y: pos.y, r: r, life: 5, color: 'rgba(52, 152, 219, 0.3)' });
            for (let e of game.enemies) {
                if (Math2.dist(pos.x, pos.y, e.pos.x, e.pos.y) < r) e.hit(dmg, pos, 4);
            }
        }
    },
    wand: {
        name: "Varita Mágica", baseCd: 40, baseDmg: 20, range: 450, icon: '🪄',
        onFire: (pos, target, dmg) => {
            const angle = Math.atan2(target.pos.y - pos.y, target.pos.x - pos.x);
            game.projectiles.push(new Projectile(pos.x, pos.y, Math.cos(angle) * 8, Math.sin(angle) * 8, dmg, 100, 1, 2));
        }
    },
    sword: {
        name: "Espada", baseCd: 50, baseDmg: 35, range: 120, icon: '⚔️',
        onFire: (pos, target, dmg) => {
            const angle = Math.atan2(target.pos.y - pos.y, target.pos.x - pos.x);
            game.tempEffects.push({ x: pos.x, y: pos.y, angle: angle, type: 'slash', life: 10 });
            for (let e of game.enemies) {
                const d = Math2.dist(pos.x, pos.y, e.pos.x, e.pos.y);
                if (d < 120 * game.player.stats.range) {
                    const eAng = Math.atan2(e.pos.y - pos.y, e.pos.x - pos.x);
                    let diff = eAng - angle;
                    if (diff > Math.PI) diff -= Math.PI * 2;
                    if (diff < -Math.PI) diff += Math.PI * 2;
                    if (Math.abs(diff) < 1.0) e.hit(dmg, pos, 10);
                }
            }
        }
    },
    rocket: {
        name: "Lanzamisiles", baseCd: 90, baseDmg: 50, range: 500, icon: '🚀',
        onFire: (pos, target, dmg) => {
            const angle = Math.atan2(target.pos.y - pos.y, target.pos.x - pos.x);
            const p = new Projectile(pos.x, pos.y, Math.cos(angle) * 7, Math.sin(angle) * 7, dmg, 80, 1, 2);
            p.radius = 8; p.color = '#e67e22';
            p.update = function () {
                this.pos.x += this.vx; this.pos.y += this.vy;
                this.duration--;
                let hit = false;
                for (let e of game.enemies) if (Math2.checkCircleCol(this, e)) { hit = true; break; }
                if (hit || this.duration <= 0) {
                    this.dead = true;
                    game.tempEffects.push({ x: this.pos.x, y: this.pos.y, r: 80, life: 10, color: 'rgba(230, 126, 34, 0.5)' });
                    for (let e of game.enemies) if (Math2.dist(this.pos.x, this.pos.y, e.pos.x, e.pos.y) < 80) e.hit(this.damage, this.pos, 15);
                }
            };
            game.projectiles.push(p);
        }
    }
};

/**
 * --- GAME LOOP ---
 */
const game = {
    state: 'menu', frame: 0, wave: 1, waveTime: 30, timer: 0, kills: 0, shake: 0, camera: { x: 0, y: 0 },
    player: null, enemies: [], gems: [], projectiles: [], texts: [], tempEffects: [],
    difficultySettings: null,

    init(starterClass) {
        this.player = new Player(starterClass);
        this.difficultySettings = DIFF_CONFIG[currentDifficulty];

        // Set Diff Badge
        const b = document.getElementById('diff-badge');
        b.innerText = this.difficultySettings.id;
        b.style.color = this.difficultySettings.color;

        let weaponKey = 'pistol';
        if (starterClass === 'melee') weaponKey = 'sword';
        if (starterClass === 'mage') weaponKey = 'wand';
        if (starterClass === 'heavy') weaponKey = 'rocket';

        this.player.weapons.push(new Weapon(WEAPONS_DB[weaponKey]));
        this.resetWave();
        this.state = 'playing';
        loop();
    },

    resetWave() {
        this.timer = this.waveTime;
        this.enemies = []; this.gems = []; this.projectiles = []; this.texts = []; this.tempEffects = [];
    },

    nextWave() {
        this.wave++;
        this.timer = this.waveTime + (this.wave * 5);
        document.getElementById('shop-modal').classList.remove('active');
        this.state = 'playing';
    },

    spawnGem(x, y, value) { this.gems.push(new Gem(x, y, value)); },
    addText(text, x, y, col) { this.texts.push(new FloatingText(text, x, y, col)); },

    update() {
        if (this.state !== 'playing') return;
        this.frame++;

        // SPAWN: Dificultad Afecta el Rate
        // Base rate: 60 - wave*3.
        // Diff aggro: resta más frames para que sea más rápido.
        const spawnAggro = this.difficultySettings.spawnAggro;
        const rate = Math.max(5, 60 - (this.wave * 3) - (spawnAggro * this.wave * 0.5));

        if (this.frame % Math.floor(rate) === 0) {
            // Pool de enemigos disponibles en cada ola
            const enemyPool = ['worm', 'beetle', 'bat', 'spider', 'ogre', 'alien'];
            let selectedEnemy = 'worm';
            const r = Math.random();
            
            if (this.wave > 2 && r > 0.7) selectedEnemy = 'beetle';
            if (this.wave > 4) { 
                if (r > 0.6) selectedEnemy = 'bat'; 
                else if (r > 0.85) selectedEnemy = 'spider'; 
            }
            if (this.wave > 8 && r > 0.4) selectedEnemy = enemyPool[Math2.randInt(1, 3)];

            const enemyType = ENEMIES_DB[selectedEnemy];
            this.enemies.push(new Enemy(enemyType, this.player.pos));
        }

        if (this.frame % 60 === 0) {
            this.timer--;
            if (this.timer <= 0) this.openShop();
        }

        this.player.update();
        this.camera.x = this.player.pos.x - CANVAS.width / 2;
        this.camera.y = this.player.pos.y - CANVAS.height / 2;

        this.enemies.forEach(e => e.update());
        this.enemies = this.enemies.filter(e => !e.dead);
        this.gems.forEach(g => g.update());
        this.gems = this.gems.filter(g => !g.dead);
        this.projectiles.forEach(p => p.update());
        this.projectiles = this.projectiles.filter(p => !p.dead);
        this.texts.forEach(t => t.update());
        this.texts = this.texts.filter(t => t.life > 0);
        this.tempEffects = this.tempEffects.filter(e => { e.life--; return e.life > 0; });

        this.updateUI();
    },

    draw() {
        CTX.fillStyle = '#212529';
        CTX.fillRect(0, 0, CANVAS.width, CANVAS.height);

        CTX.strokeStyle = '#2c3e50';
        CTX.lineWidth = 2;
        CTX.beginPath();
        const gridSize = 100;
        const offX = -this.camera.x % gridSize;
        const offY = -this.camera.y % gridSize;
        for (let i = offX; i < CANVAS.width; i += gridSize) { CTX.moveTo(i, 0); CTX.lineTo(i, CANVAS.height); }
        for (let i = offY; i < CANVAS.height; i += gridSize) { CTX.moveTo(0, i); CTX.lineTo(CANVAS.width, i); }
        CTX.stroke();

        CTX.save();
        if (this.shake > 0) {
            CTX.translate(Math.random() * this.shake - this.shake / 2, Math.random() * this.shake - this.shake / 2);
            this.shake *= 0.9;
            if (this.shake < 0.5) this.shake = 0;
        }

        this.gems.forEach(g => g.draw(CTX, this.camera));
        this.projectiles.forEach(p => p.draw(CTX, this.camera));
        this.enemies.forEach(e => e.draw(CTX, this.camera));
        if (this.player) this.player.draw(CTX, this.camera);

        this.tempEffects.forEach(e => {
            if (e.color) {
                CTX.fillStyle = e.color;
                CTX.beginPath();
                CTX.arc(e.x - this.camera.x, e.y - this.camera.y, e.r, 0, Math.PI * 2);
                CTX.fill();
            }
            if (e.type === 'slash') {
                CTX.save();
                CTX.translate(e.x - this.camera.x, e.y - this.camera.y);
                CTX.rotate(e.angle);
                CTX.fillStyle = 'rgba(255, 255, 255, 0.6)';
                CTX.beginPath();
                CTX.arc(0, 0, 80, -0.5, 0.5);
                CTX.lineTo(0, 0);
                CTX.fill();
                CTX.restore();
            }
        });

        this.texts.forEach(t => t.draw(CTX, this.camera));
        CTX.restore();
    },

    levelUp() {
        this.state = 'levelup';
        const modal = document.getElementById('levelup-modal');
        const grid = document.getElementById('levelup-grid');
        grid.innerHTML = '';
        modal.classList.add('active');
        const options = [
            { txt: "+10% Daño", stat: 'damage', val: 0.1, icon: '⚔️' },
            { txt: "+10% Vel. Ataque", stat: 'attackSpeed', val: -0.1, icon: '⚡' },
            { txt: "+20 Vida Max", stat: 'maxHp', val: 20, icon: '❤️' },
            { txt: "+10% Velocidad", stat: 'speed', val: 0.5, icon: '👟' },
            { txt: "+2 Armadura", stat: 'armor', val: 2, icon: '🛡️' },
            { txt: "+2% Robo Vida", stat: 'lifesteal', val: 2, icon: '🧛' }
        ];
        for (let i = 0; i < 3; i++) {
            const opt = options[Math2.randInt(0, options.length - 1)];
            const card = document.createElement('div');
            card.className = 'card stat-up';
            card.innerHTML = `<div class="icon">${opt.icon}</div><h3>${opt.txt}</h3>`;
            card.onclick = () => {
                this.player.stats[opt.stat] += opt.val;
                if (opt.stat === 'maxHp') this.player.stats.hp += 20;
                modal.classList.remove('active');
                this.state = 'playing';
            };
            grid.appendChild(card);
        }
    },

    openShop() {
        this.state = 'shop';
        this.enemies = []; this.gems.forEach(g => this.player.gainXp(g.value)); this.gems = []; this.projectiles = [];
        document.getElementById('wave-num').innerText = this.wave;
        document.getElementById('shop-money').innerText = this.player.money;
        const modal = document.getElementById('shop-modal');
        modal.classList.add('active');
        this.shop.generate();
        this.shop.updateStats();
    },

    shop: {
        reroll: function () {
            if (game.player.money >= 5) {
                game.player.money -= 5;
                document.getElementById('shop-money').innerText = game.player.money;
                this.generate();
            }
        },
        generate: function () {
            const grid = document.getElementById('shop-grid');
            grid.innerHTML = '';
            const pool = [
                { type: 'wep', key: 'pistol', price: 50 }, { type: 'wep', key: 'shotgun', price: 180 },
                { type: 'wep', key: 'garlic', price: 80 }, { type: 'wep', key: 'wand', price: 100 },
                { type: 'wep', key: 'sword', price: 90 }, { type: 'wep', key: 'rocket', price: 150 },
                { type: 'item', name: "Esteroides", desc: "+15% Daño", stat: 'damage', val: 0.15, price: 40, icon: '💉' },
                { type: 'item', name: "Café", desc: "+10% Vel. Atq", stat: 'attackSpeed', val: -0.1, price: 40, icon: '☕' },
                { type: 'item', name: "Botiquín", desc: "+30 Vida y Curar", stat: 'maxHp', val: 30, price: 30, icon: '🩹' },
                { type: 'item', name: "Imán", desc: "+50 Rango Recoger", stat: 'pickupRange', val: 50, price: 20, icon: '🧲' },
                { type: 'item', name: "Chaleco", desc: "+2 Armadura", stat: 'armor', val: 2, price: 45, icon: '🦺' },
                { type: 'item', name: "Gafas", desc: "+10 Rango", stat: 'range', val: 0.1, price: 25, icon: '🕶️' }
            ];
            for (let i = 0; i < 4; i++) {
                const item = pool[Math2.randInt(0, pool.length - 1)];
                const card = document.createElement('div');
                card.className = `card ${item.type === 'wep' ? 'weapon' : ''}`;
                let title, desc, icon;
                if (item.type === 'wep') {
                    const wDef = WEAPONS_DB[item.key];
                    title = wDef.name; desc = "Nueva / Subir Nivel"; icon = wDef.icon;
                } else {
                    title = item.name; desc = item.desc; icon = item.icon;
                }
                card.innerHTML = `<div class="icon">${icon}</div><h3>${title}</h3><p>${desc}</p><div class="price">${item.price}💎</div>`;
                card.onclick = () => {
                    if (game.player.money >= item.price) {
                        game.player.money -= item.price;
                        document.getElementById('shop-money').innerText = game.player.money;
                        if (item.type === 'wep') {
                            const existing = game.player.weapons.find(w => w.def === WEAPONS_DB[item.key]);
                            if (existing) existing.level++;
                            else game.player.weapons.push(new Weapon(WEAPONS_DB[item.key]));
                        } else {
                            game.player.stats[item.stat] += item.val;
                            if (item.stat === 'maxHp') game.player.heal(item.val);
                        }
                        card.style.opacity = 0.2; card.style.pointerEvents = 'none'; this.updateStats();
                    }
                };
                grid.appendChild(card);
            }
        },
        updateStats: function () {
            const list = document.getElementById('stats-list');
            const s = game.player.stats;
            list.innerHTML = `
                <div class="stat-row"><span>Daño</span><span class="stat-val">${Math.round(s.damage * 100)}%</span></div>
                <div class="stat-row"><span>Vel. Ataque</span><span class="stat-val">${Math.round(s.attackSpeed * 100)}%</span></div>
                <div class="stat-row"><span>Vida Max</span><span class="stat-val">${s.maxHp}</span></div>
                <div class="stat-row"><span>Armadura</span><span class="stat-val">${s.armor}</span></div>
                <div class="stat-row"><span>Robo Vida</span><span class="stat-val">${s.lifesteal}%</span></div>
            `;
        }
    },

    updateUI() {
        document.getElementById('hp-bar').style.width = `${Math.max(0, (this.player.stats.hp / this.player.stats.maxHp) * 100)}%`;
        document.getElementById('hp-text').innerText = `${Math.floor(Math.max(0, this.player.stats.hp))}/${this.player.stats.maxHp}`;
        document.getElementById('xp-bar').style.width = `${(this.player.xp / this.player.nextLevelXp) * 100}%`;
        document.getElementById('xp-text').innerText = `LVL ${this.player.level}`;
        document.getElementById('money-display').innerText = this.player.money;
        document.getElementById('kill-display').innerText = this.kills;
        document.getElementById('timer-display').innerText = `00:${this.timer < 10 ? '0' + this.timer : this.timer}`;
    },

    gameOver() {
        this.state = 'gameover';
        document.getElementById('gameover-modal').classList.add('active');
        document.getElementById('final-wave').innerText = this.wave;
        document.getElementById('final-diff').innerText = this.difficultySettings.id;
        document.getElementById('final-diff').style.color = this.difficultySettings.color;
    }
};

const keys = {};
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

const joystick = { active: false, x: 0, y: 0 };
const joyZone = document.getElementById('joystick-zone');
let jOrigin = { x: 0, y: 0 };
let joyCursorPos = { x: 0, y: 0 }; // Posición del cursor visual

joyZone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    jOrigin = { x: t.clientX, y: t.clientY };
    joystick.active = true;
}, { passive: false });

joyZone.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!joystick.active) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - jOrigin.x;
    const dy = t.clientY - jOrigin.y;
    const dist = Math.min(50, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    joystick.x = Math.cos(angle);
    joystick.y = Math.sin(angle);
    
    // Actualizar posición visual del cursor del joystick
    joyCursorPos.x = Math.cos(angle) * dist;
    joyCursorPos.y = Math.sin(angle) * dist;
    
    // Mover el cursor (::before) del joystick
    if (joyZone) {
        joyZone.style.setProperty('--joy-x', `${joyCursorPos.x}px`);
        joyZone.style.setProperty('--joy-y', `${joyCursorPos.y}px`);
    }
}, { passive: false });

const endJoy = (e) => { 
    e.preventDefault(); 
    joystick.active = false; 
    joystick.x = 0; 
    joystick.y = 0;
    joyCursorPos.x = 0;
    joyCursorPos.y = 0;
    
    // Resetear posición visual
    if (joyZone) {
        joyZone.style.setProperty('--joy-x', '0px');
        joyZone.style.setProperty('--joy-y', '0px');
    }
};
joyZone.addEventListener('touchend', endJoy);
joyZone.addEventListener('touchcancel', endJoy);

function loop() { game.update(); game.draw(); requestAnimationFrame(loop); }
function startGame(cls) { document.getElementById('start-modal').classList.remove('active'); game.init(cls); }