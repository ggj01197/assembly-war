import Phaser from 'phaser';
import '@fontsource/jua';
import './style.css';
import { VIEW_W, VIEW_H } from './game/constants';
import { BootScene } from './game/scenes/BootScene';

// 한 프레임에서 예외가 나면 실기기에서는 게임 루프가 영영 멈춘다 (개냥전쟁 교훈). 잡아서 기록만 하고 계속 돈다.
const origStep = Phaser.Game.prototype.step;
let badFrames = 0;
Phaser.Game.prototype.step = function (this: Phaser.Game, time: number, delta: number) {
  try { origStep.call(this, time, delta); badFrames = 0; } catch (e) {
    console.error('frame error', e);
    if (++badFrames >= 90) { badFrames = 0; location.reload(); }
  }
};

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#0b1420',
  pixelArt: false,
  // 세로 전용: 가로폭 390 을 화면에 맞추고 세로는 남는 만큼 늘린다
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER, min: { width: 320, height: 568 } },
  scene: [BootScene],
});
