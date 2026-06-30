// ============================================================
//  IDENTIO — Game Data
//  src/data.js
//
//  좌표는 모두 % 단위 (이미지 대비 상대 위치)
//  x, y = 좌상단 기준, w = 너비, h = 높이
//
//  단서 위치 조정이 필요할 경우 이 파일의 값만 수정하세요.
//  Debug 모드: 게임 중 Ctrl+D → 클릭 영역 시각화
// ============================================================

window.GAME_DATA = {

  // ---- 비밀번호 ----
  PASSWORD: 'HOME',

  // ---- 타이머 ----
  TIMER_TOTAL:   120,   // 전체 시간 (초)
  TIMER_WARNING: 30,    // 경고 시작 (초)

  // ---- 스토리 씬 효과음 (index → 파일 경로) ----
  STORY_SOUNDS: {
    0: '07_audio/story/scene_01_whistle.mp3?v=3',
    1: '07_audio/story/scene_02_kakaotalk.mp3?v=3',
    2: '07_audio/story/scene_03_boss.mp3?v=3',
    3: '07_audio/story/scene_03_boss.mp3?v=3',   // scene_04: 동일 보스 소리
    4: '07_audio/story/scene_05_sigh.mp3?v=3',
  },

  // ---- 게임 효과음 ----
  SFX: {
    arrowClick:    '07_audio/game/arrow_click.mp3?v=3',   // 화면 전환용 (새 파일)
    popupClick:    '07_audio/game/popup_click.mp3?v=3',   // 팝업용 (기존 파일)
    timerWarning:  '07_audio/game/time_warning.mp3?v=3',
    passwordWrong: '07_audio/game/password_wrong.mp3?v=3',
    gameBGM:       '07_audio/game/game_bg.mp3?v=3',
  },

  // ---- 방 순서 ----
  ROOM_ORDER: ['conference_room', 'lounge', 'desk', 'monitor'],

  // ---- 방별 데이터 ----
  ROOMS: {

    conference_room: {
      bg: '03_game/conference_room/bg_conference_room.png',
      // 이동 버튼 (오른쪽만)
      nav: {
        right: { x: 83, y: 47, w: 17, h: 12, to: 'lounge' },
      },
      // 모니터 클릭 영역 (null = 없음)
      monitorZone: null,
      // 단서 클릭 영역
      clues: [
        {
          id: 'book',
          x: 21, y: 71, w: 13, h: 6,
          popup: '03_game/conference_room/clues/popup_conference_room_book.png',
        },
        {
          id: 'chair',
          x: 63, y: 59, w: 30, h: 30,
          popup: '03_game/conference_room/clues/popup_conference_room_chair.png',
        },
        {
          id: 'flower_pot',
          x: 58, y: 44, w: 12, h: 12,
          popup: '03_game/conference_room/clues/popup_conference_room_flower_pot.png',
        },
        {
          id: 'frame',
          x: 55.5, y: 30.9, w: 20.0, h: 6.4,
          popup: '03_game/conference_room/clues/popup_conference_room_frame.png',
        },
      ],
      hints: [
        '06_hint/conference_room/hint_book.png',
        '06_hint/conference_room/hint_chair.png',
        '06_hint/conference_room/hint_flower_pot.png',
        '06_hint/conference_room/hint_frame.png',
      ],
    },

    lounge: {
      bg: '03_game/lounge/bg_lounge_2.png?v=3',
      // 이동 버튼 (양쪽)
      nav: {
        left:  { x: 0,  y: 47, w: 8,  h: 12, to: 'conference_room' },
        right: { x: 92, y: 47, w: 8,  h: 12, to: 'desk' },
      },
      monitorZone: null,
      clues: [
        {
          id: 'macbook',
          x: 62, y: 61, w: 18, h: 11,
          popup: '03_game/lounge/clues/popup_lounge_macbook.png',
          sound: '07_audio/game/Oh.mp3', // 5초 오버레이용 사운드
          duration: 5,
        },
        {
          id: 'mini_chair',
          x: 5, y: 64, w: 24, h: 19,
          popup: '03_game/lounge/clues/popup_lounge_mini_chair.png',
        },
        {
          id: 'poster',
          x: 22, y: 32, w: 18, h: 14,
          popup: '03_game/lounge/clues/popup_lounge_poster_1.png',
          sound: '07_audio/game/Oh.mp3', // 5초 오버레이용 사운드
          duration: 5,
        },
      ],
      hints: [
        '06_hint/lounge/hint_macbook.png',
        '06_hint/lounge/hint_mini_chair.png',
        '06_hint/lounge/hint_poster.png',
      ],
    },

    desk: {
      bg: '03_game/desk/bg_desk.png',
      // 이동 버튼 (왼쪽만 - 서류와 겹치지 않게 y값을 41로 위로 이동)
      nav: {
        left: { x: 0, y: 41, w: 8, h: 12, to: 'lounge' },
      },
      // 책상 모니터 클릭 → 모니터 씬으로 (모니터 전체를 감싸도록 가로 넓이를 68%로 대폭 확장)
      monitorZone: { x: 14, y: 28, w: 68, h: 24 },
      clues: [
        {
          id: 'goldbar',
          x: 77, y: 53, w: 19, h: 10,
          popup: '03_game/desk/clues/popup_desk_goldbar.png',
          sound: '07_audio/game/wow.mp3', // 금괴 전용 효과음
        },
        {
          id: 'note',
          x: 0, y: 54, w: 17, h: 15, // 전선과 겹치지 않게 가로폭을 17%로 조정
          popup: '03_game/desk/clues/popup_desk_note.png',
        },
        {
          id: 'wire',
          x: 18, y: 55, w: 20, h: 18, // 서류뭉치와 분리하여 18%부터 시작
          popup: '03_game/desk/clues/popup_desk_wire.png',
        },
        {
          id: 'toy',
          x: 45.4, y: 18.2, w: 10.6, h: 1.9,
          popup: '03_game/desk/clues/popup_desk_toy.png',
        },
      ],
      hints: [
        '06_hint/desk/hint_goldbar.png',
        '06_hint/desk/hint_note.png',
        '06_hint/desk/hint_wire.png',
        '06_hint/desk/hint_toy.png',
      ],
      // 모니터 전용 힌트 (흰색 스트로크 깜빡임 효과)
      monitorHint: '06_hint/desk/hint_monitor.png',
    },

    monitor: {
      bg: '03_game/monitor/bg_monitor.png',
      // 이동 버튼 (왼쪽만)
      nav: {
        left: { x: 0, y: 47, w: 8, h: 12, to: 'desk' },
      },
      monitorZone: null,
      clues: [],
    },
  },
};
