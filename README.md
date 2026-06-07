# One More English — 설치 가이드

매일 영어 패턴 2개와 단어 5개를 받아보는 학습 PWA입니다.
Today 콘텐츠는 **GitHub Actions가 매일 새벽 자동 생성**합니다. (API 키가 폰에 노출되지 않습니다.)

## 폴더 구성
```
index.html            앱 본체
manifest.json         PWA 설정
sw.js                 오프라인 캐시
icon-192.png
icon-512.png
content/              ← 매일 콘텐츠가 쌓이는 곳
  2026-06-07.json       (샘플 1개 포함)
  index.json
scripts/generate.js   콘텐츠 생성 스크립트
.github/workflows/daily.yml   매일 자동 실행
```

---

## 1단계 · GitHub에 올리기
1. 새 저장소(public) 생성
2. 위 파일/폴더를 **구조 그대로** 업로드 (content, scripts, .github 폴더 포함)
3. Settings ▸ Pages ▸ Source = `main` 브랜치 `/ (root)` 선택
4. 잠시 뒤 주소가 생성됨: `https://<아이디>.github.io/<저장소>/`

## 2단계 · API 키 등록 (Today 자동 생성용)
1. https://console.anthropic.com 에서 API 키 발급
2. 저장소 ▸ Settings ▸ Secrets and variables ▸ Actions ▸ **New repository secret**
3. 이름 `ANTHROPIC_API_KEY`, 값에 발급받은 키 입력 후 저장

## 3단계 · 첫 콘텐츠 만들기 (한 번만 수동)
저장소 ▸ Actions 탭 ▸ "Daily English Content" ▸ **Run workflow** 버튼 클릭
→ 오늘 날짜 JSON이 content 폴더에 생성됨.
이후로는 **매일 새벽 5시(KST) 자동 실행**됩니다.

## 4단계 · 폰에 앱으로 설치
- **갤럭시(삼성인터넷/Chrome)**: 위 주소 열기 → 메뉴(⋮) ▸ "홈 화면에 추가" / "앱 설치"
- **아이폰(Safari)**: 주소 열기 → 공유 버튼 ▸ "홈 화면에 추가"

홈 화면 아이콘으로 전체화면 실행되고, 한 번 본 내용은 오프라인에서도 열립니다.

---

## 참고
- 자동 실행 시각을 바꾸려면 `.github/workflows/daily.yml`의 cron을 수정하세요. (`0 20 * * *` = UTC 20시 = KST 새벽 5시)
- Phrases / Words / Mindset 탭은 직접 입력하는 공간이라 인터넷·API 없이도 동작합니다.
- 콘텐츠는 폰에도 캐시되므로, 지난 날짜는 이전/다음 버튼이나 좌우 스와이프로 다시 볼 수 있습니다.
