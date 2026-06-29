// ============================================================
//  IDENTIO — Game Engine
//  src/main.js
//
//  실행 순서: data.js 먼저 로드 후 이 파일 로드
//  디버그 모드: 게임 중 Ctrl+D → 클릭 영역(hotspot) 시각화
// ============================================================

(function () {
  'use strict';

  /* ----------------------------------------------------------
     데이터 참조 (data.js에서 window.GAME_DATA로 주입)
  ---------------------------------------------------------- */
  const DATA = window.GAME_DATA;

  /* ----------------------------------------------------------
     게임 상태
  ---------------------------------------------------------- */
  const state = {
    scene:         'intro',            // intro | story | game | monitor | ending
    storyIndex:    0,                  // 0~4
    room:          'conference_room',  // 현재 방
    timerSeconds:  DATA.TIMER_TOTAL,
    timerInterval: null,
    password:      '',
    popupOpen:     false,
    debugMode:     false,
  };

  /* ----------------------------------------------------------
     DOM 요소
  ---------------------------------------------------------- */
  const $ = id => document.getElementById(id);

  const el = {
    // scenes
    sceneLoading:  $('scene-loading'),
    loadingBgFull: $('loading-bg-full'),
    loadingButton: $('loading-button'),
    sceneIntro:    $('scene-intro'),
    sceneStory:    $('scene-story'),
    sceneGame:     $('scene-game'),
    sceneMonitor:  $('scene-monitor'),
    sceneEnding:   $('scene-ending'),

    // intro
    introVideo:      $('intro-video'),
    introClickZone:  $('intro-click-zone'),

    // story
    storyImg:   $('story-img'),
    storyTap:   $('story-tap'),

    // game
    roomBg:         $('room-bg'),
    hintLayer:      $('hint-layer'),
    hotspotLayer:   $('hotspot-layer'),
    missionOverlay: $('mission-overlay'),
    cluePopup:      $('clue-popup'),
    popupImg:       $('popup-img'),

    // monitor
    pwDisplay:    $('pw-display'),
    pwSubmit:     $('pw-submit'),
    keyboardZone: $('keyboard-zone'),

    // timer
    timerUi:    $('timer-ui'),
    timerText:  $('timer-text'),
    timerBar:   $('timer-bar'),
    timerFrame: $('timer-frame'),

    // ending
    endingVideo:     $('ending-video'),
    endingClickZone: $('ending-click-zone'),
  };

  /* ----------------------------------------------------------
     오디오 유틸
  ---------------------------------------------------------- */
  const _audioCache = {};
  let currentAudio = null;
  let currentAudioTimeout = null;

  function playSound(src, keepPrevious = false, duration = null) {
    if (!src) return;
    try {
      // 기존 재생 중인 소리가 있고, keepPrevious가 false일 때만 이전 소리를 정지
      if (currentAudio && !keepPrevious) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }

      // 이전 예약된 정지 타이머가 있으면 초기화
      if (!keepPrevious && currentAudioTimeout) {
        clearTimeout(currentAudioTimeout);
        currentAudioTimeout = null;
      }
      
      const cacheBustSrc = src;

      if (!_audioCache[src]) {
        _audioCache[src] = new Audio(cacheBustSrc);
      }
      const a = _audioCache[src];
      a.currentTime = 0;
      a.volume = 1.0; // 볼륨 초기화
      a.play().catch(() => {});
      
      // keepPrevious가 아닐 때만 현재 제어할 메인 오디오로 등록
      if (!keepPrevious) {
        currentAudio = a;
      }

      // 재생 제한 시간(duration)이 설정된 경우
      if (duration) {
        const audioToFade = a;
        // 총 재생 시간에서 1초 전부터 볼륨을 줄이기 시작
        const fadeStartTime = Math.max(0, (duration * 1000) - 1000);
        
        currentAudioTimeout = setTimeout(() => {
          let steps = 10;
          let currentStep = 0;
          const interval = setInterval(() => {
            currentStep++;
            audioToFade.volume = Math.max(0, 1.0 - (currentStep / steps));
            if (currentStep >= steps) {
              clearInterval(interval);
              audioToFade.pause();
              audioToFade.currentTime = 0;
              audioToFade.volume = 1.0; // 다음 재생을 위해 볼륨 복구
            }
          }, 100); // 100ms * 10 = 1000ms (1초 동안 페이드아웃)
        }, fadeStartTime);
      }
    } catch (e) { /* silent */ }
  }

  function stopCurrentSound() {
    if (currentAudioTimeout) {
      clearTimeout(currentAudioTimeout);
      currentAudioTimeout = null;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
  }

  /* ----------------------------------------------------------
     씬 전환
  ---------------------------------------------------------- */
  const SCENE_ELS = {
    loading: el.sceneLoading,
    intro:   el.sceneIntro,
    story:   el.sceneStory,
    game:    el.sceneGame,
    monitor: el.sceneMonitor,
    ending:  el.sceneEnding,
  };

  function goToScene(name) {
    // 모든 씬 숨김
    Object.values(SCENE_ELS).forEach(s => s.classList.remove('active'));

    // 타이머: 게임/모니터 씬에서만 표시
    if (name === 'game' || name === 'monitor') {
      el.timerUi.classList.remove('hidden');
    } else {
      el.timerUi.classList.add('hidden');
    }

    state.scene = name;
    SCENE_ELS[name].classList.add('active');
  }

  /* ----------------------------------------------------------
     타이머
  ---------------------------------------------------------- */
  let warningAudio = null;

  function playWarningSound() {
    const src = DATA.SFX.timerWarning;
    const cacheBustSrc = src;

    if (!warningAudio) {
      warningAudio = new Audio(cacheBustSrc);
      warningAudio.loop = true; // 30초 동안 끊김없이 계속 루프되도록 설정
    }
    warningAudio.currentTime = 0;
    warningAudio.volume = 1.0;
    warningAudio.play().catch(() => {});
  }

  function stopWarningSound() {
    if (warningAudio) {
      warningAudio.pause();
      warningAudio.currentTime = 0;
    }
  }

  /* ----------------------------------------------------------
     게임 배경음악 (BGM)
     - 미션 화면 진입 시부터 시작해서 30초 경고 전까지 재생
  ---------------------------------------------------------- */
  let bgmAudio = null;
  let bgmFadeInterval = null;

  function playBGM() {
    // 기존 BGM 및 페이드 인터벌이 실행 중이라면 정리
    stopBGM();

    const src = DATA.SFX.gameBGM;
    const cacheBustSrc = src;

    if (!bgmAudio) {
      bgmAudio = new Audio(cacheBustSrc);
      bgmAudio.loop = true;
    }
    bgmAudio.currentTime = 0;
    bgmAudio.volume = 0.35; // 데시벨을 기본보다 낮춰 은은하게 설정
    bgmAudio.play().catch(() => {});
  }

  function stopBGM() {
    if (bgmFadeInterval) {
      clearInterval(bgmFadeInterval);
      bgmFadeInterval = null;
    }
    if (bgmAudio) {
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
      bgmAudio.volume = 0.35; // 볼륨 값 리셋
    }
  }

  function fadeBGM(durationSeconds) {
    if (!bgmAudio || bgmAudio.paused) return;

    const startVolume = bgmAudio.volume;
    const steps = 50; // 50단계로 잘게 쪼개어 부드럽게 감쇄
    const intervalMs = (durationSeconds * 1000) / steps;
    let currentStep = 0;

    if (bgmFadeInterval) clearInterval(bgmFadeInterval);

    bgmFadeInterval = setInterval(() => {
      currentStep++;
      const ratio = currentStep / steps;
      bgmAudio.volume = Math.max(0, startVolume * (1 - ratio));

      if (currentStep >= steps) {
        clearInterval(bgmFadeInterval);
        bgmFadeInterval = null;
        bgmAudio.pause();
        bgmAudio.currentTime = 0;
      }
    }, intervalMs);
  }

  function startTimer() {
    if (state.timerInterval) return;
    state.timerSeconds = DATA.TIMER_TOTAL;
    renderTimer();

    state.timerInterval = setInterval(() => {
      state.timerSeconds--;
      renderTimer();

      // BGM 페이드 아웃 구간 (30초 도달 5초 전인 35초 시점부터 자연스럽게 감소 시작)
      if (state.timerSeconds === 35) {
        fadeBGM(5);
      }

      // 경고 구간 (30초)
      if (state.timerSeconds === DATA.TIMER_WARNING) {
        stopBGM(); // 확실하게 BGM 스트림 중단
        // 프레임을 경고 프레임으로 교체
        el.timerFrame.src = '05_ui/timer_frame_warning.png';
        el.timerText.classList.add('warning');
        playWarningSound(); // 독립 채널로 경고음 재생 시작
      }

      // 시간 초과
      if (state.timerSeconds <= 0) {
        stopTimer();
        // 게이지를 완전히 비움
        el.timerBar.style.clipPath = 'inset(0 100% 0 0)';
        endGame('fail');
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    stopWarningSound(); // 타이머가 정지되면(종료/성공/리셋 등) 경고음도 즉시 정지
    stopBGM();          // BGM도 즉시 정지
  }

  function renderTimer() {
    const sec = Math.max(0, state.timerSeconds);
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    el.timerText.textContent = `${m}:${s}`;

    // 시간 비율에 따라 게이지바(timer_bar)의 오른쪽 영역을 잘라내어 줄어드는 연출 생성
    const percent = (sec / DATA.TIMER_TOTAL) * 100;
    const cropPercent = 100 - percent;
    el.timerBar.style.clipPath = `inset(0 ${cropPercent}% 0 0)`;
  }

  /* ----------------------------------------------------------
     게임 종료
  ---------------------------------------------------------- */
  function endGame(result) {
    stopTimer();
    const src = result === 'success'
      ? '04_ending/success.mp4'
      : '04_ending/fail.mp4';

    el.endingVideo.loop = true;
    el.endingVideo.src  = src;
    goToScene('ending');
    el.endingVideo.play().catch(() => {});

    // 영상이 한 바퀴 돌면 클릭 영역 활성화
    // (첫 루프가 끝나는 시점: currentTime이 0에 가깝게 다시 줄어들 때)
    el.endingClickZone.classList.add('hidden');
    let firstLoop = true;
    function onTimeUpdate() {
      if (el.endingVideo.currentTime > 0.5) firstLoop = false;
      if (!firstLoop && el.endingVideo.currentTime < 0.3) {
        el.endingClickZone.classList.remove('hidden');
        el.endingVideo.removeEventListener('timeupdate', onTimeUpdate);
      }
    }
    el.endingVideo.addEventListener('timeupdate', onTimeUpdate);
  }

  /* ----------------------------------------------------------
     게임 리셋 (인트로로 되돌아가기)
  ---------------------------------------------------------- */
  function resetGame() {
    state.storyIndex   = 0;
    state.room         = 'conference_room';
    state.timerSeconds = DATA.TIMER_TOTAL;
    state.password     = '';
    state.popupOpen    = false;

    // 배경음악 즉시 정지
    stopBGM();

    // 미션 오버레이 숨김 초기화
    el.missionOverlay.classList.add('hidden');

    // 타이머 UI 초기화
    el.timerFrame.src = '05_ui/timer_frame.png';
    el.timerBar.style.clipPath = 'inset(0 0% 0 0)';
    el.timerText.textContent = '02:00';
    el.timerText.classList.remove('warning');

    el.endingVideo.pause();
    el.endingVideo.src = '';
    el.endingClickZone.classList.add('hidden');

    el.introVideo.currentTime = 0;
    el.introVideo.pause();
    el.introClickZone.style.display = '';

    // 인트로가 아닌 첫 로딩 화면으로 완전히 되돌림
    goToScene('loading');
    initLoading();
  }

  // 엔딩 클릭존 이벤트 (초기 1회 등록)
  el.endingClickZone.addEventListener('click', resetGame);

  /* ==========================================================
     LOADING SCENE (로딩 화면)
  ========================================================== */
  // 게임에 필요한 모든 리소스 목록 (사전 로딩용)
  const PRELOAD_ASSETS = {
    images: [
      // 배경
      '03_game/conference_room/bg_conference_room.png',
      '03_game/conference_room/bg_mission.png',
      '03_game/lounge/bg_lounge_2.png?v=3',
      '03_game/desk/bg_desk.png',
      '03_game/monitor/bg_monitor.png',
      // 스토리
      '02_story/scene_01.png',
      '02_story/scene_02.png',
      '02_story/scene_03.png',
      '02_story/scene_04.png',
      '02_story/scene_05.png',
      // UI
      '05_ui/timer_frame.png',
      '05_ui/timer_frame_warning.png',
      '05_ui/timer_full.png',
      '05_ui/timer_full_box.png',
      '05_ui/timer_warning.png',
      '05_ui/timer_zero.png',
      '05_ui/timer_zero_box.png',
      // 단서 팝업
      '03_game/conference_room/clues/popup_conference_room_book.png',
      '03_game/conference_room/clues/popup_conference_room_chair.png',
      '03_game/conference_room/clues/popup_conference_room_flower_pot.png',
      '03_game/conference_room/clues/popup_conference_room_frame.png',
      '03_game/lounge/clues/popup_lounge_macbook.png',
      '03_game/lounge/clues/popup_lounge_mini_chair.png',
      '03_game/lounge/clues/popup_lounge_poster_1.png',
      '03_game/desk/clues/popup_desk_goldbar.png',
      '03_game/desk/clues/popup_desk_note.png',
      '03_game/desk/clues/popup_desk_wire.png',
      // 힌트 누끼
      '06_hint/conference_room/hint_book.png',
      '06_hint/conference_room/hint_chair.png',
      '06_hint/conference_room/hint_flower_pot.png',
      '06_hint/conference_room/hint_frame.png',
      '06_hint/lounge/hint_macbook.png',
      '06_hint/lounge/hint_mini_chair.png',
      '06_hint/lounge/hint_poster.png',
      '06_hint/desk/hint_goldbar.png',
      '06_hint/desk/hint_note.png',
      '06_hint/desk/hint_wire.png',
      '06_hint/desk/hint_monitor.png'
    ],
    audio: [
      '07_audio/story/scene_01_whistle.mp3?v=3',
      '07_audio/story/scene_02_kakaotalk.mp3?v=3',
      '07_audio/story/scene_03_boss.mp3?v=3',
      '07_audio/story/scene_05_sigh.mp3?v=3',
      '07_audio/game/arrow_click.mp3?v=3',
      '07_audio/game/popup_click.mp3?v=3',
      '07_audio/game/time_warning.mp3?v=3',
      '07_audio/game/password_wrong.mp3?v=3',
      '07_audio/game/game_bg.mp3?v=3',
      '07_audio/game/Oh.mp3',
      '07_audio/game/wow.mp3'
    ]
  };

  function preloadGameAssets() {
    // 이미지 사전 로드
    PRELOAD_ASSETS.images.forEach(src => {
      const img = new Image();
      img.src = src;
    });
    // 오디오 사전 로드
    PRELOAD_ASSETS.audio.forEach(src => {
      const aud = new Audio(src);
      aud.preload = 'auto';
      aud.load();
    });
  }

  function initLoading() {
    // 1단계: 로딩 요소 상태 초기화 및 자원 사전 로딩 작동
    el.loadingBgFull.classList.remove('loaded');
    el.loadingButton.classList.remove('active');
    preloadGameAssets();

    // 2단계: 2초 동안 가득 차는 로딩 바 가동
    setTimeout(() => {
      el.loadingBgFull.classList.add('loaded');
    }, 100);

    // 3단계: 로딩이 완료된 시점 (2.1초 후) 시작 버튼 활성화
    setTimeout(() => {
      el.loadingButton.classList.add('active');
    }, 2100);

    // 4단계: 버튼 클릭 시 인트로로 전환
    const onStartClick = (e) => {
      e.stopPropagation();
      // 버튼 비활성화 (이중 클릭 방지)
      el.loadingButton.classList.remove('active');
      el.loadingButton.removeEventListener('click', onStartClick);
      el.loadingButton.removeEventListener('touchstart', onStartClick);

      // 인트로 씬 진입
      goToScene('intro');
      initIntro();
    };

    el.loadingButton.addEventListener('click', onStartClick);
    el.loadingButton.addEventListener('touchstart', onStartClick);
  }

  /* ==========================================================
     INTRO SCENE
  ========================================================== */
  function initIntro() {
    const video          = el.introVideo;
    const introClickZone = el.introClickZone;
    let transitioned = false;

    // 이미 로딩 화면에서 사용자 터치가 감지되었으므로, 바로 소리 켜진 상태로 시작!
    video.muted = false;
    video.loop  = true;
    video.currentTime = 0;
    video.play().catch(() => {
      // 혹시라도 예외 상황 시 음소거 플레이 백업
      video.muted = true;
      video.play().catch(() => {});
    });

    // 화면 아무 곳이나 클릭/터치하면 즉시 음소거 해제 (브라우저 차단 우회 보장 백업)
    function unmuteVideo() {
      video.muted = false;
      window.removeEventListener('click', unmuteVideo);
      window.removeEventListener('touchstart', unmuteVideo);
    }
    window.addEventListener('click', unmuteVideo);
    window.addEventListener('touchstart', unmuteVideo);

    function toStory() {
      if (transitioned) return;
      transitioned = true;
      // 이벤트 안전 제거
      window.removeEventListener('click', unmuteVideo);
      window.removeEventListener('touchstart', unmuteVideo);
      video.pause();
      goToScene('story');
      initStory();
    }

    // 투명 시작 버튼 클릭 → 즉시 스토리로 전환
    introClickZone.addEventListener('click', (e) => {
      e.stopPropagation(); // document 클릭 이벤트 전파 방지
      introClickZone.style.display = 'none';
      video.muted = false; // 소리 켜기 보장
      toStory();
    }, { once: true });
  }

  /* ==========================================================
     STORY SCENE
  ========================================================== */
  function initStory() {
    state.storyIndex = 0;
    showStoryFrame(0);

    function onTap() {
      state.storyIndex++;
      if (state.storyIndex >= 5) {
        el.storyTap.removeEventListener('click', onTap);
        stopCurrentSound(); // 스토리 사운드 정지
        // 미션 화면 진입과 동시에 배경음악 재생 시작
        playBGM();

        // 게임 시작
        goToScene('game');
        state.room = 'conference_room';
        loadRoom(state.room);
        
        // 미션 오버레이 표시 및 타이머 보류
        el.missionOverlay.classList.remove('hidden');
        
        // 미션 오버레이 클릭 시 타이머 시작 및 오버레이 페이드아웃
        const onMissionClick = () => {
          el.missionOverlay.classList.add('hidden');
          // 팝업 오프닝 연출용 효과음
          playSound(DATA.SFX.popupClick);
          startTimer();
          el.missionOverlay.removeEventListener('click', onMissionClick);
        };
        el.missionOverlay.addEventListener('click', onMissionClick);
      } else {
        showStoryFrame(state.storyIndex);
      }
    }

    el.storyTap.addEventListener('click', onTap);
  }

  function showStoryFrame(index) {
    const num = String(index + 1).padStart(2, '0');
    el.storyImg.src = `02_story/scene_${num}.png`;
    
    // index === 1 (scene_02)일 때는 카톡음이 나면서 scene_01의 휘파람이 중첩되도록 keepPrevious = true
    const keepPrevious = (index === 1);
    playSound(DATA.STORY_SOUNDS[index], keepPrevious);
  }

  /* ==========================================================
     GAME SCENE — 방 로드
  ========================================================== */
  function loadRoom(roomName) {
    state.room = roomName;
    const room = DATA.ROOMS[roomName];

    // 배경 이미지 교체
    el.roomBg.src = room.bg;

    // 기존 hotspot 초기화
    el.hotspotLayer.innerHTML = '';

    // 팝업 닫기
    closePopup();

    // --- 이동 버튼 ---
    Object.entries(room.nav).forEach(([dir, nav]) => {
      const zone = makeHotspot(nav.x, nav.y, nav.w, nav.h, 'nav-zone', () => {
        playSound(DATA.SFX.arrowClick);
        if (nav.to === 'monitor') {
          goToScene('monitor');
          initMonitor();
        } else {
          loadRoom(nav.to);
        }
      });
      el.hotspotLayer.appendChild(zone);
    });

    // --- 모니터 클릭 영역 (책상 → 모니터 씬) ---
    if (room.monitorZone) {
      const mz = room.monitorZone;
      const zone = makeHotspot(mz.x, mz.y, mz.w, mz.h, 'monitor-zone', () => {
        playSound(DATA.SFX.arrowClick);
        goToScene('monitor');
        initMonitor();
      });
      el.hotspotLayer.appendChild(zone);
    }

    // --- 단서 클릭 영역 ---
    room.clues.forEach(clue => {
      const zone = makeHotspot(clue.x, clue.y, clue.w, clue.h, 'clue-zone', () => {
        togglePopup(clue.popup, clue.sound, clue.duration);
      });
      el.hotspotLayer.appendChild(zone);
    });

    // --- 힌트 누끼 글로우 사이클 시작 ---
    startHintCycle(room.hints || []);

    // --- 모니터 전용 힌트 (흰색 스트로크 깜빡임, 독립 동작) ---
    if (room.monitorHint) {
      const monImg = document.createElement('img');
      monImg.src = room.monitorHint;
      monImg.alt = '모니터 힌트';
      monImg.classList.add('hint-monitor'); // CSS 깜빡임 애니메이션 자동 적용
      el.hintLayer.appendChild(monImg);
    }

    // 디버그 모드 반영
    applyDebugMode();
  }

  /* ----------------------------------------------------------
     힌트 글로우 사이클
     - 각 단서가 순서대로 2초간 점등 ➡️ 소등 후 3초 대기 ➡️ 다음 단서 점등 무한 반복
  ---------------------------------------------------------- */
  let hintCycleTimeout = null;
  let hintImages = [];
  let hintCycleIndex = 0;

  function startHintCycle(hints) {
    // 기존 사이클 정지 및 DOM 초기화
    stopHintCycle();
    el.hintLayer.innerHTML = '';
    hintImages = [];
    hintCycleIndex = 0; // 순서 초기화

    if (!hints || hints.length === 0) return;

    // 힌트 이미지 요소들 생성
    hints.forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '힌트';
      el.hintLayer.appendChild(img);
      hintImages.push(img);
    });

    // 사이클 시작
    runHintCycle();
  }

  function runHintCycle() {
    if (hintImages.length === 0) return;

    // 순차적으로 선택
    const target = hintImages[hintCycleIndex];

    // 빛나기 시작 (opacity 0 → 1, CSS transition 0.6s)
    target.classList.add('hint-visible');

    // 2초 동안 빛나기 유지 후 소등
    hintCycleTimeout = setTimeout(() => {
      target.classList.remove('hint-visible');

      // 다음 단서로 인덱스 전환
      hintCycleIndex = (hintCycleIndex + 1) % hintImages.length;

      // 소등 후 3초 대기한 뒤 다음 힌트 켜기
      hintCycleTimeout = setTimeout(() => {
        runHintCycle();
      }, 3000);
    }, 2000);
  }

  function stopHintCycle() {
    if (hintCycleTimeout) {
      clearTimeout(hintCycleTimeout);
      hintCycleTimeout = null;
    }
    // 모든 힌트 즉시 끄기
    hintImages.forEach(img => img.classList.remove('hint-visible'));
  }

  /* Hotspot 생성 헬퍼 */
  function makeHotspot(x, y, w, h, cls, onClick) {
    const div = document.createElement('div');
    div.className = `hotspot ${cls}`;
    div.style.left   = `${x}%`;
    div.style.top    = `${y}%`;
    div.style.width  = `${w}%`;
    div.style.height = `${h}%`;
    div.addEventListener('click', onClick);
    return div;
  }

  /* ----------------------------------------------------------
     단서 팝업
  ---------------------------------------------------------- */
  function togglePopup(src, customSound = null, duration = null) {
    if (state.popupOpen) {
      closePopup();
    } else {
      // 커스텀 사운드가 지정되어 있으면 그것을 재생, 없으면 기본 팝업 효과음 재생
      const soundToPlay = customSound || DATA.SFX.popupClick;
      
      // 거실 맥북/포스터 효과음(Oh.mp3)이 재생될 경우 배경음악 음소거
      if (customSound && customSound.includes('Oh.mp3')) {
        if (bgmAudio) bgmAudio.muted = true;
      }
      
      playSound(soundToPlay, false, duration);
      openPopup(src);

      // 효과음 시간(duration)이 다 끝나서 소리가 멈추는 타이밍에 BGM 음소거 해제
      if (duration && customSound && customSound.includes('Oh.mp3')) {
        setTimeout(() => {
          if (bgmAudio) bgmAudio.muted = false;
        }, duration * 1000);
      }
    }
  }

  function openPopup(src) {
    state.popupOpen = true;
    el.popupImg.src = src;
    el.cluePopup.classList.remove('hidden');
    // 팝업 클릭 → 닫기
    el.cluePopup.addEventListener('click', closePopup, { once: true });
  }

  function closePopup() {
    // 팝업이 닫히면 언제나 안전하게 BGM 음소거를 해제
    if (bgmAudio) bgmAudio.muted = false;

    playSound(DATA.SFX.popupClick); // 팝업 닫을 때도 효과음 재생
    state.popupOpen = false;
    el.cluePopup.classList.add('hidden');
    el.popupImg.src = '';
  }

  /* ==========================================================
     MONITOR SCENE — 비밀번호 입력
  ========================================================== */
  function initMonitor() {
    state.password = '';
    renderPassword();
    buildKeyboard();

    // 뒤로 버튼
    const navLeft = document.getElementById('monitor-nav-left');
    navLeft.onclick = () => {
      playSound(DATA.SFX.arrowClick);
      goToScene('game');
    };

    // 확인 버튼
    el.pwSubmit.onclick = submitPassword;
  }

  function renderPassword() {
    // 입력된 글자 수만큼 ● 표시
    el.pwDisplay.textContent = '● '.repeat(state.password.length).trim();
  }

  function submitPassword() {
    if (state.password.toUpperCase() === DATA.PASSWORD) {
      stopTimer();
      endGame('success');
    } else {
      playSound(DATA.SFX.passwordWrong);
      el.pwDisplay.classList.add('shake');
      setTimeout(() => el.pwDisplay.classList.remove('shake'), 500);
      state.password = '';
      renderPassword();
    }
  }

  /* QWERTY 키보드 생성 */
  function buildKeyboard() {
    const ROWS = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['DEL','Z','X','C','V','B','N','M','↵'],
    ];

    el.keyboardZone.innerHTML = '';

    ROWS.forEach(row => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'kb-row';

      row.forEach(key => {
        const btn  = document.createElement('button');
        const isSpecial = key === 'DEL' || key === '↵';
        btn.className  = 'kb-key' + (isSpecial ? ' kb-special' : '');
        btn.textContent = key;
        btn.type = 'button';

        btn.addEventListener('click', () => {
          onKeyPress(key);
          // 시각 피드백
          btn.classList.add('pressed');
          setTimeout(() => btn.classList.remove('pressed'), 150);
        });

        rowDiv.appendChild(btn);
      });

      el.keyboardZone.appendChild(rowDiv);
    });
  }

  function onKeyPress(key) {
    if (key === 'DEL') {
      state.password = state.password.slice(0, -1);
    } else if (key === '↵') {
      submitPassword();
    } else {
      if (state.password.length < 12) state.password += key;
    }
    renderPassword();
  }

  /* 실제 키보드 입력 지원 */
  document.addEventListener('keydown', e => {
    if (state.scene !== 'monitor') return;
    const k = e.key.toUpperCase();
    if (k === 'BACKSPACE' || k === 'DELETE') {
      onKeyPress('DEL');
    } else if (k === 'ENTER') {
      onKeyPress('↵');
    } else if (/^[A-Z]$/.test(k)) {
      onKeyPress(k);
    }
  });

  /* ==========================================================
     DEBUG MODE — Ctrl+D 토글
  ========================================================== */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      state.debugMode = !state.debugMode;
      applyDebugMode();
      console.log('[IDENTIO Debug]', state.debugMode ? 'ON' : 'OFF');
    }
  });

  function applyDebugMode() {
    const game = document.getElementById('game');
    if (state.debugMode) {
      game.classList.add('debug');
    } else {
      game.classList.remove('debug');
    }
  }

  /* ==========================================================
     시작
  ========================================================== */
  goToScene('loading');
  initLoading();

})();
