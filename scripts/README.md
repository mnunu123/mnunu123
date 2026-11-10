# 프로필 SVG 다시 만들기

`assets/` 안의 SVG는 전부 `scripts/build.mjs`가 만듭니다. 직접 고치지 말고 스크립트의 데이터만 바꾼 뒤 다시 빌드하세요.

```bash
npm install
npm run build    # assets/*.svg (라이트) + assets/*-dark.svg (다크) 28개 생성
```

## 어디를 고치면 되나

| 바꿀 것 | `build.mjs` 안 위치 |
|---|---|
| 히어로 숫자 3개 (수상 · 대상 · R&D) | `hero()` 안 `stats` |
| 히어로 스택 줄 | `hero()` 안 `stack` |
| 흘러가는 키워드 | `TICKER` |
| 섹션 제목 · 오른쪽 배지 | `SECTIONS` |
| 수상 카드 (대상 · 최우수) | `AWARDS` — 합계 줄 문구도 `awards()` 끝에서 같이 고치기 |
| 레이어 지도 | `LAYERS`, `LAYER_MAP` (프로젝트별로 맡은 레이어 번호) |
| 주요 프로젝트 6개 | `PROJECTS` |
| 기술 스택 | `STACK` |
| 색 | `PALETTES` (포트폴리오 사이트와 같은 색) |

## 동작 방식

- 글자는 Pretendard · JetBrains Mono 글리프를 path로 바꿔 넣습니다. GitHub는 SVG 안에서 웹폰트를 못 불러오기 때문에, 이렇게 해야 어떤 환경에서도 똑같이 보입니다. 폰트 파일은 npm 패키지에서 읽기만 하고 저장소에는 넣지 않습니다.
- 움직임은 SVG 안 CSS `@keyframes`입니다. 시스템에서 동작 줄이기를 켠 사람에게는 멈춘 화면이 보입니다.
- README는 `<picture>` + `prefers-color-scheme`으로 라이트/다크 파일을 골라 보여줍니다.
- 히어로 오른쪽 UART 시퀀스의 문자열(`ACT:HOME ALL`, `ACK,HOME`, `DONE,HOME,ALL`, 호밍 FSM 상태)은 [Threebot_firmware](https://github.com/mnunu123/Threebot_firmware)의 실제 코드에서 가져왔습니다.
