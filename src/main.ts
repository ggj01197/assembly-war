import Phaser from 'phaser';
import './style.css';
import './ui.css';
import { VIEW_W, VIEW_H } from './game/constants';
import { BattleScene } from './game/scenes/BattleScene';
import { startApp } from './ui/app';

// 한 프레임에서 예외가 나면 실기기에서는 게임 루프가 영영 멈춘다 (개냥전쟁 교훈). 잡아서 기록만 하고 계속 돈다.
const origStep = Phaser.Game.prototype.step;
let badFrames = 0;
Phaser.Game.prototype.step = function (this: Phaser.Game, time: number, delta: number) {
  try { origStep.call(this, time, delta); badFrames = 0; } catch (e) {
    console.error('frame error', e);
    if (++badFrames >= 90) { badFrames = 0; location.reload(); }
  }
};

/** 아무것도 안 그리는 첫 씬 — 전장(BattleScene)은 출격 때만 시작한다 */
class IdleScene extends Phaser.Scene { constructor() { super('idle'); } }

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#0b1420',
  pixelArt: false,
  // 세로 전용: 화면 크기를 그대로 쓰고 각 씬이 가로폭 기준으로 배치한다
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER, min: { width: 320, height: 480 } },
  scene: [IdleScene, BattleScene],
});

void startApp(game);
