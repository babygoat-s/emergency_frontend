# 119 긴급 음성 분석기

`emergency_backend`의 FastAPI API에 연결하는 Vite + React 반응형 프런트엔드입니다. 파일 업로드·실시간 녹음·현재 분석 결과를 한 화면에서 사용합니다. DB와 기록 API가 없어 분석 기록 메뉴와 자동 저장은 없습니다.

## 실행

백엔드 터미널:

```powershell
cd C:\Users\lemon\Desktop\emergency_backend
.\run.ps1
```

프런트엔드 터미널:

```powershell
cd C:\Users\lemon\Desktop\emergency_frontend
npm install
npm run dev
```

브라우저에서 <http://localhost:5173>에 접속합니다. 의존성이 설치되어 있으면 `npm install`은 생략할 수 있습니다. Vite는 `/api`의 HTTP와 WebSocket을 기본 백엔드 `http://127.0.0.1:8000`으로 프록시합니다.

전사에는 백엔드의 Whisper 실행 환경이 필요하고, Gemini 상황 분석에는 `.env`의 `GEMINI_API_KEY`가 필요합니다. 기본 모델은 `gemini-3.5-flash-lite`이며 백엔드의 `GEMINI_MODEL`이 우선합니다. 설정을 바꾸면 백엔드를 재시작하세요. 서버가 실행 중이면 고정 예시를 볼 수 있습니다. 상태 표시는 서버 응답과 키 입력 여부를 보여 줍니다.

## 분석 결과의 의미

Whisper가 음성을 텍스트로 변환하고, 백엔드에 연결한 KoELECTRA가 증상을 분류합니다. **고열, 구토·오심, 두통, 복통, 어지러움, 열상, 전신쇠약, 호흡곤란**을 대상으로 하며 같은 목록을 화면의 **분류할 수 있는 증상** 카드에서 볼 수 있습니다. 로컬 분류기를 설정하지 않은 환경에서는 Gemini가 증상 추출도 담당합니다.

Gemini는 상황 요약·긴급도·맞춤 확인 질문을 생성합니다. 실시간 녹음에서는 Gemini가 지연되거나 503을 반환해도 전사, 로컬 증상 분류, 기본 확인 질문이 표시됩니다. 대기 중에는 최신 전사를 모아서 보내며 연결이 열려 있으면 503 대기 후 한 번 재시도합니다.

**분류할 수 있는 증상** 카드 안에서 긴급도 5단계를 **최하 → 하 → 중 → 상 → 최상** 순서로 함께 안내합니다. 정보가 부족할 때는 **판단 보류**를 별도로 표시합니다. 긴급도는 담당자 판단을 보조하는 표시입니다. 화자와 음성 상태는 연결된 모델이 실제 값을 반환한 경우에 표시하며, 체험 결과에는 예시 표시가 붙습니다.

## 기능

- 파일 업로드: 드래그 앤 드롭·파일 선택·미리 듣기·언어 선택·분석 취소.
- 파일 검사: 서버 설정의 확장자·용량과 읽을 수 있는 재생 시간 검사. 최종 디코딩·검증은 백엔드에서 수행.
- 실시간 녹음: AudioWorklet으로 16 kHz, 모노, PCM16 little-endian을 100ms 단위 전송. 종료 시 마지막 프레임과 최종 분석 처리.
- 결과: 전사·시간 구간·상황 요약·긴급도·증상과 원문·확인 질문. 현재 결과를 UTF-8 텍스트로 다운로드.
- 예시: 고열·구토·두통이 포함된 가상 신고의 고정 결과를 조회. 미리보기 문장과 증상 태그도 서버에서 제공.
- 사용 안내: 파일·마이크 사용 절차, 서버 상태와 처리 지연 안내.

REST와 WebSocket의 서버 오류 메시지를 화면에 그대로 표시하지 않습니다. 입력 오류·요청 과다·시간 초과 등은 프런트엔드의 고정 문구로 안내하고 나머지는 일반 분석 실패 문구로 표시합니다. 상세 HTTP 상태·내부 오류 코드·키 설정·모델 요청 상세는 사용자 화면과 다운로드에 포함하지 않습니다. 개발자 진단은 백엔드 README의 `check_gemini.py`를 사용합니다.

현재 결과는 React 메모리에만 존재해 새로고침하면 사라집니다. 음성은 분석을 위해 백엔드로 전송되며 전사 등은 백엔드가 구성한 Gemini API로 전송될 수 있습니다. 필요한 결과는 새로고침 전에 직접 다운로드하세요.

## 연결 API

| 기능 | HTTP | Path |
| --- | --- | --- |
| 서버 상태 | GET | `/api/v1/health` |
| 분석 설정 | GET | `/api/v1/analysis/config` |
| 파일 전체 분석 | POST | `/api/v1/analysis/file` |
| 고정 예시 | GET | `/api/v1/analysis/example` |
| 실시간 분석 | WebSocket | `/api/v1/analysis/realtime` |

요청·응답 계약은 백엔드 `docs/API.md`를 참고하세요. 실시간은 `start → ready → PCM binary → finish → finished` 순서입니다. 전사·증상·상황 분석의 `sequence`를 따로 관리하며, 최신 Gemini 결과를 기다리는 동안 기본 질문을 표시합니다. 파일·예시 분석 완료 시 결과 영역으로 이동합니다.

## 환경 설정과 배포

필요한 경우 `.env.example`을 `.env.local`로 복사해 변경합니다.

```dotenv
API_PROXY_TARGET=http://127.0.0.1:8000
# 별도 도메인 배포 시 서버 origin만 지정 (/api/v1 제외).
# VITE_API_BASE_URL=https://your-api.example.com
```

- 개발과 `npm run preview`는 Vite 프록시를 사용합니다.
- `npm run build`의 정적 결과물에는 프록시가 포함되지 않습니다. 운영 서버에 `/api` HTTP·WebSocket 프록시를 구성하거나 `VITE_API_BASE_URL`을 설정하고 다시 빌드하세요.
- 다른 origin에 직접 연결하면 백엔드 `CORS_ORIGINS`에 프런트엔드 origin을 허용해야 합니다. WebSocket도 같은 정책을 따릅니다.
- 마이크는 localhost 또는 HTTPS에서 사용합니다. 모바일 기기 접속에는 HTTPS가 필요합니다.
- HTTPS 프런트엔드에서는 HTTPS/WSS 백엔드를 사용하세요.
- `VITE_` 변수는 브라우저에 노출됩니다. Gemini 키는 백엔드에서만 관리하세요.
- Noto Sans KR 웹폰트에 연결하지 못하면 시스템 한글 글꼴을 사용합니다.

## 프로젝트 구조

```text
src/
  App.jsx                   화면과 사용자 작업 상태
  App.css                   반응형 레이아웃
  index.css                 기본 스타일
  api/analysis.js           REST 요청·취소·WebSocket 주소
  audio/realtime.js         녹음·연결·종료·정리
  audio/pcm-worklet.js      PCM16 프레임 변환
  components/Icon.jsx      SVG 아이콘
  components/Results.jsx   분석 결과와 다운로드
  lib/results.js           응답 병합·파일 검증·시간 표시
  lib/error-messages.js    사용자용 고정 오류 문구
tests/                      PCM·응답 순서·종료·취소·오류 비노출 테스트
```

## 검증

```powershell
npm test
npm run lint
npm run build
```

자동 테스트는 Node 내장 테스트 러너를 사용하며 실제 마이크·외부 AI 모델을 호출하지 않습니다. 실제 모델 연결 진단과 설정은 백엔드 README에서 관리합니다.
