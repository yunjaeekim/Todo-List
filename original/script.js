// 1. 요소 가져오기: input / button / ul
const input = document.querySelector('#todoInput');
const addBtn = document.querySelector("#addBtn");
const list = document.querySelector("#todoList");

// 2. addTodo() 만들기: 입력값 읽고 검증(trim, 빈 값 처리)
function addTodo() {
    const text = input.value.trim();

    if (!text) return;

    // 3. li 생성/추가: 텍스트 넣고 ul에 append

    const li = document.createElement('li');
    li.textContent = text;

    // 4. 삭제 처리(초심플): li 클릭 시 remove
    li.addEventListener("click", () => li.remove());

    // 5. 마무리 UX: input 비우기 + focus()
    list.appendChild(li);
    input.value = "";
    input.focus();

}


// 6. 이벤트 연결: 버튼 클릭 → addTodo()
addBtn.addEventListener("click", addTodo);

// 7. 이벤트 연결: Enter 키 → addTodo()
input.addEventListener("keydown", (e) => {
    if (e.key === "enter") addTodo();
});