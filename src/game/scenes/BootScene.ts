import Phaser from 'phaser';
import { VIEW_W } from '../constants';
import { PARTS } from '../../data/parts';
import { assemble } from '../../domain/assemble';

/**
 * 2단계 뼈대 씬: 제목 + 조립 규칙이 실제로 돈다는 것을 화면에 보여 준다.
 * 파츠 그림(sprites/parts/*.png)이 있으면 다리→몸통→무기 순으로 겹쳐 그린다 (TD-006), 없으면 색 사각형.
 */
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    this.load.setPath('sprites/parts');
    for (const p of PARTS) this.load.image(p.id, `${p.id}.png`);
    // 그림이 없어도 씬은 떠야 한다 (404 는 무시)
    this.load.on('loaderror', (f: Phaser.Loader.File) => console.warn('no sprite', f.key));
  }

  create() {
    const w = this.scale.width, h = this.scale.height;
    this.cameras.main.setBackgroundColor('#0b1420');
    this.add.text(w / 2, 90, '조립전쟁', { fontFamily: 'Jua', fontSize: '48px', color: '#e9f1ff' }).setOrigin(0.5);
    this.add.text(w / 2, 140, 'Assembly War · 뼈대 0.1.0', { fontFamily: 'Jua', fontSize: '18px', color: '#5fd3ff' }).setOrigin(0.5);

    const legs = PARTS.filter(p => p.kind === 'legs').slice(0, 3);
    const bodies = PARTS.filter(p => p.kind === 'body').slice(0, 3);
    const weapons = PARTS.filter(p => p.kind === 'weapon').slice(0, 3);
    let i = 0;
    for (const l of legs) for (const b of bodies) for (const wp of weapons) {
      const r = assemble({ legs: l.id, body: b.id, weapon: wp.id }, PARTS);
      const col = i % 3, row = Math.floor(i / 3);
      const x = 65 + col * 130, y = 230 + row * 150;
      this.drawUnit(x, y, [l.id, b.id, wp.id], r.ok);
      this.add.text(x, y + 56, r.ok ? `${r.watt}W` : '불가', { fontFamily: 'Jua', fontSize: '14px', color: r.ok ? '#e9f1ff' : '#ff9f43' }).setOrigin(0.5);
      i++;
      if (i >= 9) break;
    }
    this.add.text(w / 2, h - 40, `파츠 ${PARTS.length}종 · 가로 ${VIEW_W}`, { fontFamily: 'Jua', fontSize: '14px', color: '#8aa2c8' }).setOrigin(0.5);
  }

  private drawUnit(x: number, y: number, ids: string[], ok: boolean) {
    const colors = [0x3c5a8a, 0x5f86c4, 0x9fd3ff];
    ids.forEach((id, k) => {
      if (this.textures.exists(id)) {
        this.add.image(x, y - k * 18, id).setDisplaySize(96, 96).setAlpha(ok ? 1 : 0.4);
      } else {
        this.add.rectangle(x, y - k * 18, 60 - k * 12, 24, colors[k]).setAlpha(ok ? 1 : 0.4);
      }
    });
  }
}
