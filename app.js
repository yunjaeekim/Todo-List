// 1. 요소 가져오기: input / button / ul


// 2. addTodo() 만들기: 입력값 읽고 검증(trim, 빈 값 처리)


// 3. li 생성/추가: 텍스트 넣고 ul에 append


// 4. 삭제 처리(초심플): li 클릭 시 remove


// 5. 마무리 UX: input 비우기 + focus()


// 6. 이벤트 연결: 버튼 클릭 → addTodo()


// 7. 이벤트 연결: Enter 키 → addTodo()

// 1. 요소 가져오기: input / button / ul
// (기존 주석) HTML에서 필요한 요소(태그) 가져오기
const input = document.querySelector("#todoInput");
const addBtn = document.querySelector("#addBtn");
const list = document.querySelector("#todoList");


// 2. addTodo() 만들기: 입력값 읽고 검증(trim, 빈 값 처리)
// (기존 주석) 버튼을 누르면 할 일을 추가하는 함수
function addTodo() {
  // (기존 주석) 앞뒤 공백 제거
  const text = input.value.trim();

  // (기존 주석) 아무것도 안 썼으면 추가 안 함
  if (!text) return;


  // 3. li 생성/추가: 텍스트 넣고 ul에 append
  // (기존 주석) li(목록 아이템) 만들기
  const li = document.createElement("li");
  li.textContent = text;


  // 4. 삭제 처리(초심플): li 클릭 시 remove
  // (기존 주석) 클릭하면 삭제(초심플)
  li.addEventListener("click", () => li.remove());


  // 5. 마무리 UX: input 비우기 + focus()
  // (기존 주석) ul에 추가하고, 입력창 비우기
  list.appendChild(li);
  input.value = "";
  input.focus();
}


// 6. 이벤트 연결: 버튼 클릭 → addTodo()
// (기존 주석) "추가" 버튼 클릭 시 실행
addBtn.addEventListener("click", addTodo);


// 7. 이벤트 연결: Enter 키 → addTodo()
// (기존 주석) Enter 키로도 추가되게(초심플)
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTodo();
});