# 119 긴급 음성 분석기

기존 emergency_backend의 FastAPI API에 연결하는 Vite + React 프런트엔드입니다. 데스크톱·태블릿·모바일에 맞게 구현했습니다.

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

브라우저에서 <http://localhost:5173>에 접속합니다. 의존성이 설치되어 있으면 npm install은 생략할 수 있습니다. 기본 백엔드 주소는 http://127.0.0.1:8000이며 Vite가 /api의 HTTP와 WebSocket을 함께 프록시합니다.

실제 상황 분석에는 백엔드 .env의 GEMINI_API_KEY와 Whisper 실행 환경이 필요합니다. 키가 없어도 백엔드의 고정 예시 결과를 확인할 수 있습니다. 상태 API는 서버 응답과 키 입력 여부만 확인하며 모델 준비나 외부 API 연결 성공을 보장하지 않습니다.

## 기능

- 파일 업로드: 드래그 앤 드롭, 파일 선택, 음성 미리 듣기, 언어 선택, 분석·취소.
- 파일 검사: 서버 설정에 따른 확장자·용량 검사, 브라우저에서 길이를 읽을 수 있는 파일의 재생 시간 검사. 디코딩과 최종 검증은 백엔드가 수행합니다.
- 실시간 녹음: AudioWorklet에서 16 kHz, mono, signed PCM16 little-endian으로 변환해 100 ms 단위로 전송. 종료 시 마지막 프레임을 전송하고 최종 분석까지 기다립니다.
- 분석 결과: 전사와 구간 시간, 상황 요약, 긴급도와 근거, 증상과 원문, 확인 질문. 모델이 실제 값을 반환할 때만 화자와 음성 상태를 표시합니다.
- 예시 체험: 백엔드의 고정 예시를 실제 AI 결과와 구별해 표시. API가 제공하지 않는 예시 음성 재생 버튼은 없습니다.
- 결과 다운로드: 현재 결과를 UTF-8 텍스트로 직접 다운로드.
- 안내: 서버 연결, 마이크 권한·전송 오류, 분석 지연, 예시 여부와 담당자 검토 안내.

DB와 기록 API가 없는 백엔드에 맞춰 분석 기록 메뉴·목록·자동 저장은 구현하지 않았습니다. 결과는 React 메모리에만 존재하며 새로고침하면 사라집니다. 음성은 분석을 위해 백엔드로 전송되며, 백엔드는 구성된 모델 제공자를 호출할 수 있습니다.

## 연결 API

| 기능 | 메서드 | 경로 |
| --- | --- | --- |
| 서버 상태 | GET | /api/v1/health |
| 지원 형식·용량·언어·길이 설정 | GET | /api/v1/analysis/config |
| 파일 전체 분석 | POST multipart (file, language) | /api/v1/analysis/file |
| 고정 예시 | GET | /api/v1/analysis/example |
| 실시간 분석 | WebSocket | /api/v1/analysis/realtime |

실시간 연결은 start → ready → PCM binary → finish → finished 순서입니다. audio와 analysis의 sequence를 각각 관리해 응답이 역순으로 도착해도 최신 전사를 유지합니다. 상황 분석이 지연되면 이전 분석임을 표시하며 전사를 계속 갱신합니다.

## 환경 설정

필요할 때 .env.example을 .env.local로 복사해 변경합니다.

```dotenv
API_PROXY_TARGET=http://127.0.0.1:8000
# 별도 도메인 배포 시 서버 origin만 지정 (/api/v1 제외).
# VITE_API_BASE_URL=https://your-api.example.com
```

- 개발 및 npm run preview는 Vite 프록시를 사용합니다.
- npm run build의 정적 결과물에는 Vite 프록시가 포함되지 않습니다. 운영 서버에 /api HTTP·WebSocket 프록시를 구성하거나 VITE_API_BASE_URL을 지정하고 다시 빌드하세요.
- 다른 origin에 직접 연결한다면 백엔드 CORS_ORIGINS에 프런트엔드 origin을 허용해야 합니다. WebSocket도 같은 origin 검사 정책을 따릅니다.
- 마이크는 localhost 또는 HTTPS에서 동작합니다. 모바일 기기로 접속할 때는 HTTPS가 필요합니다.
- HTTPS 프런트엔드에서는 백엔드도 HTTPS/WSS를 사용해야 합니다.
- VITE_ 변수는 브라우저에 노출됩니다. Gemini 키와 다른 비밀 값은 프런트엔드에 넣지 마세요.
- Noto Sans KR 웹폰트 서버에 연결할 수 없으면 시스템 한글 글꼴로 표시합니다.

## 프로젝트 구조

```text
src/
  App.jsx                 화면과 사용자 작업 상태
  App.css                 반응형 레이아웃
  index.css               기본 스타일
  api/analysis.js         REST 요청·오류·취소·WebSocket 주소
  audio/realtime.js       녹음·연결·종료·정리
  audio/pcm-worklet.js    PCM16 프레임 변환
  components/Icon.jsx    SVG 아이콘
  components/Results.jsx 분석 결과와 다운로드
  lib/results.js         응답 병합·파일 검증·시간 표시
tests/                    응답 순서·PCM·종료·취소 테스트
```

## 검증

```powershell
npm test
npm run lint
npm run build
```

테스트는 Node 내장 테스트 러너를 사용하며 외부 모델이나 실제 마이크를 사용하지 않습니다.
