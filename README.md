# 하니게임즈

하니 키우기 + 1:1 실시간 대전 게임을 위한 Cloudflare Workers 프로젝트입니다.

## 포함
- 회원가입/로그인
- 하니 성장 및 진화 단계
- 포인트
- 게임별 1:1 방 구조
- Durable Object 기반 실시간 방 서버 뼈대
- TOP 5 랭킹
- D1 데이터베이스

## Cloudflare 설정
1. D1 데이터베이스를 만들고 `schema.sql` 실행
2. `wrangler.jsonc`의 `PUT_YOUR_D1_DATABASE_ID_HERE`를 실제 D1 ID로 변경
3. GitHub에 전체 파일 업로드
4. Cloudflare Workers에서 GitHub 저장소를 연결해 배포

참가 포인트는 게임 내부 가상 포인트로만 사용하도록 설계하세요. 현금 환전 기능은 포함하지 않습니다.
