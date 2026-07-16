# TodoList

브라우저에서 실행되는 Vanilla JavaScript 기반 Todo 애플리케이션입니다.  
Todo 데이터를 화면 요소가 아닌 JavaScript 상태로 관리하며, `localStorage`에 저장해 새로고침 후에도 목록과 완료 상태를 유지합니다.

## 주요 기능

- 할 일 추가
- 할 일 수정
- 완료 및 완료 취소
- 할 일 삭제
- 삭제 후 5초 이내 실행 취소
- 전체 / 진행 중 / 완료 필터
- 남은 할 일 개수 표시
- 빈 목록 상태 안내
- `localStorage` 자동 저장 및 복원
- 잘못된 저장 데이터 검증 및 안전한 복구
- 키보드 조작과 기본 접근성 지원
- 모바일 화면 대응

## 실행 방법

별도 설치나 빌드 과정이 필요하지 않습니다.

1. 저장소를 내려받습니다.
2. 프로젝트 폴더의 `index.html`을 브라우저에서 엽니다.

로컬 서버를 사용하려면 프로젝트 폴더에서 다음 명령을 실행할 수 있습니다.

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`으로 접속합니다.


## GitHub Pages 배포

이 저장소는 `.github/workflows/deploy-pages.yml`을 통해 정적 파일을 GitHub Pages에 배포합니다. 빌드 과정 없이 `index.html`, `style.css`, `app.js`, `.nojekyll`만 배포 아티팩트에 포함합니다.

원격 저장소를 연결하고 현재 브랜치를 push한 뒤 Pull Request를 `main`에 병합합니다.

```bash
git remote add origin <GITHUB_REPOSITORY_URL>
git push -u origin chore/github-pages-code-review
```

GitHub 저장소에서 한 번만 다음 설정을 확인합니다.

1. **Settings** → **Pages**
2. **Build and deployment**의 Source를 **GitHub Actions**로 선택
3. `main` 브랜치에 push 또는 merge
4. Actions의 `Deploy static site to GitHub Pages` 실행 결과 확인

정적 자산은 상대 경로를 사용하므로 사용자 사이트와 프로젝트 사이트 모두에서 동작합니다.

## 파일 구조

```text
.
├── index.html   # 앱 화면 구조
├── style.css    # 레이아웃, 상태, 반응형 스타일
├── app.js       # 상태, 저장소, CRUD, 렌더링, 이벤트 처리
└── README.md
```

`script.html`, `script.css`, `script.js`는 초기 학습용 코드이며 현재 앱 실행에는 사용하지 않습니다.

## 상태 관리 흐름

```text
사용자 이벤트
→ 입력 검증
→ JavaScript 상태 변경
→ localStorage 저장
→ 상태를 기준으로 화면 다시 렌더링
```

DOM은 Todo 데이터의 원본이 아닙니다. 모든 화면은 `state` 객체의 데이터를 기준으로 생성됩니다.

## 데이터 구조

### Todo

```javascript
{
  id: "f7d72e2b-b855-43ae-8214-164e8067ecf6",
  title: "JavaScript 공부하기",
  completed: false,
  createdAt: "2026-07-15T13:20:00.000Z",
  updatedAt: "2026-07-15T13:20:00.000Z",
  completedAt: null
}
```

### localStorage 저장 형식

저장 키는 다른 GitHub Pages 프로젝트와 충돌하지 않도록 `todo-list-app:state`를 사용합니다. 기존 `todoListApp` 데이터는 최초 실행 시 자동 이전됩니다.

```javascript
{
  schemaVersion: 1,
  todos: []
}
```

필터, 수정 중인 항목, 삭제 실행 취소 타이머 같은 임시 UI 상태는 저장하지 않습니다.

## 구현 구조

`app.js`는 다음 순서로 구성되어 있습니다.

1. 상수
2. DOM 요소
3. 앱 상태
4. 저장소와 데이터 검증
5. Todo 데이터 변경 함수
6. 조회와 UI 상태 함수
7. 렌더링 함수
8. 이벤트 처리 함수
9. 앱 초기화

주요 데이터 변경 함수는 다음과 같습니다.

```javascript
createTodo(title);
updateTodoTitle(todoId, nextTitle);
toggleTodo(todoId);
deleteTodo(todoId);
restoreDeletedTodo();
```

## 수동 테스트 시나리오

1. 할 일을 추가합니다.
2. 페이지를 새로고침하고 할 일이 유지되는지 확인합니다.
3. 완료 버튼을 누른 뒤 다시 새로고침합니다.
4. 완료 상태와 취소선이 유지되는지 확인합니다.
5. 제목을 수정하고 Enter 또는 저장 버튼으로 반영합니다.
6. 전체, 진행 중, 완료 필터를 각각 확인합니다.
7. Todo를 삭제하고 5초 안에 실행 취소합니다.
8. 다시 삭제한 뒤 5초가 지난 후 복구되지 않는지 확인합니다.
9. 공백만 입력했을 때 Todo가 추가되지 않는지 확인합니다.
10. 모바일 너비에서 입력창과 버튼이 깨지지 않는지 확인합니다.

## Git 작업 브랜치

현재 리뷰 및 배포 준비 브랜치 이름은 다음과 같습니다.

```text
chore/github-pages-code-review
```

원격 GitHub 저장소가 아직 연결되지 않았다면 다음 명령으로 등록합니다.

```bash
git remote add origin <GITHUB_REPOSITORY_URL>
git push -u origin feat/todo-state-persistence
```

이미 `origin`이 있다면 다음 명령만 실행합니다.

```bash
git push -u origin feat/todo-state-persistence
```

## 이후 개발 후보

- 중요도와 마감일
- 태그와 카테고리
- 드래그 기반 순서 변경
- 다크 모드
- 서버 API와 사용자 계정
- 여러 기기 동기화
- AI 기반 작업 분해 및 일정 추천
