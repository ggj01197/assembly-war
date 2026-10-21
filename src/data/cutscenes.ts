/**
 * 챕터 컷신 (GAME_DEPTH_PLAN 9단계): 장 시작 전 3컷 ×3장 + 엔딩 3컷 = 12컷. 그림(`public/art/cutscenes/cNN.jpg`, 9:16)에는 글자가 없고 대사는 여기서 얹는다.
 * 한 번 본 장면은 `save.cuts` 에 남아 다시 나오지 않는다(건너뛰기도 본 것으로 친다). 설정/격납고에서 다시 보기는 후속.
 */
export interface Line { who: string; text: string }
export interface Cut { img: string; lines: Line[] }
export interface Scene { id: string; title: string; cuts: Cut[] }

const P = (n: number) => `art/cutscenes/c${String(n).padStart(2, '0')}.jpg`;

export const SCENES: Scene[] = [
  {
    id: 'cs-ch1', title: '1장 · 훈련소',
    cuts: [
      { img: P(1), lines: [{ who: '미오', text: '사령관님, 드디어 오셨네요! 이 공방, 몇 년째 불이 꺼져 있었어요.' }, { who: '미오', text: '부품은 산더미예요. 조립만 하시면 로봇은 다시 일어날 거예요.' }] },
      { img: P(2), lines: [{ who: '가온', text: '내가 앞장서겠다. 부수는 건 맡겨라.' }, { who: '', text: '정비사령관은 첫 설계도를 그렸다.' }] },
      { img: P(3), lines: [{ who: '미오', text: '훈련 끝! 그런데… 저 멀리 폐허 공장에서 신호가 잡혀요.' }] },
    ],
  },
  {
    id: 'cs-ch2', title: '2장 · 폐허 공장',
    cuts: [
      { img: P(4), lines: [{ who: '미오', text: '폐허 공장이에요. 공중 드론이 떼로 날아다녀요. 대공 설계도가 필요해요.' }] },
      { img: P(5), lines: [{ who: '라이', text: '저 모선이 적을 계속 고치고 있어. 먼저 끊어야 한다.' }] },
      { img: P(6), lines: [{ who: '라이', text: '나도 합류하지. 저 요새까지는 내가 길을 열어 주겠다.' }, { who: '', text: '하늘이 갈라지고, 중앙 요새가 모습을 드러냈다.' }] },
    ],
  },
  {
    id: 'cs-ch3', title: '3장 · 중앙 요새',
    cuts: [
      { img: P(7), lines: [{ who: '가온', text: '포격이 쏟아진다! 멀리서 맞지 말고 붙어서 싸워야 해.' }] },
      { img: P(8), lines: [{ who: '요새 장군', text: '여기까지 온 꼬마 조립공이냐. 어디 한번 부숴 보아라.' }] },
      { img: P(9), lines: [{ who: '미오', text: '요새 코어가 꺼졌어요… 그리고 공방에 불이 다시 들어와요!' }] },
    ],
  },
  {
    id: 'cs-end', title: '에필로그',
    cuts: [
      { img: P(10), lines: [{ who: '', text: '컨베이어가 돌고, 불꽃이 튀고, 공방이 다시 숨을 쉬기 시작했다.' }] },
      { img: P(11), lines: [{ who: '가온', text: '이제 다 끝났나?' }, { who: '라이', text: '아니. 다음 임무가 올 거다. 늘 그랬으니까.' }] },
      { img: P(12), lines: [{ who: '미오', text: '사령관님, 처음 보는 신호예요. 이건… 다른 공방이에요.' }, { who: '', text: '새로운 시즌, 새로운 작전이 기다리고 있다.' }] },
    ],
  },
];

export const sceneById = (id: string): Scene | undefined => SCENES.find(s => s.id === id);
/** 장 번호(1~3) 시작 컷신 id */
export const chapterScene = (chapter: 1 | 2 | 3): string => `cs-ch${chapter}`;
export const END_SCENE = 'cs-end';
