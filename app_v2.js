"use strict";

// ============================================================
// 1. 상수
// ============================================================

const STORAGE_KEY = "todoListApp";
const SCHEMA_VERSION = 1;
const MAX_TITLE_LENGTH = 100;
const UNDO_TIMEOUT_MS = 5000;
const VALID_FILTERS = new Set(["all", "active", "completed"]);

// ============================================================
// 2. DOM 요소
// ============================================================

const todoForm = document.querySelector("#todoForm");
const todoInput = document.querySelector("#todoInput");
const todoList = document.querySelector("#todoList");
const remainingCount = document.querySelector("#remainingCount");
const filterButtons = document.querySelectorAll("[data-filter]");
const statusMessage = document.querySelector("#statusMessage");
const undoToast = document.querySelector("#undoToast");
const undoMessage = document.querySelector("#undoMessage");
const undoButton = document.querySelector("#undoButton");

// ============================================================
// 3. 앱 상태
// ============================================================

const state = {
  data: createDefaultDataState(),
  ui: {
    filter: "all",
    editingTodoId: null,
    pendingDelete: null,
    undoTimerId: null,
  },
};

// ============================================================
// 4. 저장소와 데이터 검증
// ============================================================

function createDefaultDataState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    todos: [],
  };
}

function isValidDateString(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isValidTodo(todo) {
  if (!todo || typeof todo !== "object") {
    return false;
  }

  const hasValidTitle =
    typeof todo.title === "string" &&
    todo.title.trim().length >= 1 &&
    todo.title.trim().length <= MAX_TITLE_LENGTH;

  const hasValidCompletionDate = todo.completed
    ? isValidDateString(todo.completedAt)
    : todo.completedAt === null;

  return (
    typeof todo.id === "string" &&
    todo.id.length > 0 &&
    hasValidTitle &&
    typeof todo.completed === "boolean" &&
    isValidDateString(todo.createdAt) &&
    isValidDateString(todo.updatedAt) &&
    hasValidCompletionDate
  );
}

function sanitizePersistentState(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(value.todos)
  ) {
    return createDefaultDataState();
  }

  const usedIds = new Set();
  const todos = [];

  for (const todo of value.todos) {
    if (!isValidTodo(todo) || usedIds.has(todo.id)) {
      continue;
    }

    usedIds.add(todo.id);
    todos.push({
      id: todo.id,
      title: todo.title.trim(),
      completed: todo.completed,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      completedAt: todo.completedAt,
    });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    todos,
  };
}

function loadPersistentState() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);

    if (!rawData) {
      return createDefaultDataState();
    }

    return sanitizePersistentState(JSON.parse(rawData));
  } catch (error) {
    console.error("저장된 Todo 데이터를 불러오지 못했습니다.", error);
    return createDefaultDataState();
  }
}

function savePersistentState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    return true;
  } catch (error) {
    console.error("Todo 데이터를 저장하지 못했습니다.", error);
    announce("브라우저 저장 공간에 데이터를 저장하지 못했습니다.");
    return false;
  }
}

function commitDataChange(message = "") {
  savePersistentState();
  render();

  if (message) {
    announce(message);
  }
}

// ============================================================
// 5. Todo 데이터 변경 함수
// ============================================================

function normalizeTitle(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createTodoId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTodo(title) {
  const normalizedTitle = normalizeTitle(title);

  if (
    normalizedTitle.length === 0 ||
    normalizedTitle.length > MAX_TITLE_LENGTH
  ) {
    return null;
  }

  const now = new Date().toISOString();
  const newTodo = {
    id: createTodoId(),
    title: normalizedTitle,
    completed: false,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  state.data.todos.push(newTodo);
  commitDataChange(`“${newTodo.title}” 할 일을 추가했습니다.`);
  return newTodo;
}

function findTodoById(todoId) {
  return state.data.todos.find((todo) => todo.id === todoId) ?? null;
}

function updateTodoTitle(todoId, nextTitle) {
  const todo = findTodoById(todoId);
  const normalizedTitle = normalizeTitle(nextTitle);

  if (
    !todo ||
    normalizedTitle.length === 0 ||
    normalizedTitle.length > MAX_TITLE_LENGTH
  ) {
    return false;
  }

  todo.title = normalizedTitle;
  todo.updatedAt = new Date().toISOString();
  state.ui.editingTodoId = null;
  commitDataChange("할 일을 수정했습니다.");
  return true;
}

function toggleTodo(todoId) {
  const todo = findTodoById(todoId);

  if (!todo) {
    return false;
  }

  const now = new Date().toISOString();
  todo.completed = !todo.completed;
  todo.updatedAt = now;
  todo.completedAt = todo.completed ? now : null;

  commitDataChange(
    todo.completed ? "할 일을 완료했습니다." : "할 일을 다시 진행 중으로 변경했습니다.",
  );
  return true;
}

function deleteTodo(todoId) {
  const originalIndex = state.data.todos.findIndex((todo) => todo.id === todoId);

  if (originalIndex === -1) {
    return null;
  }

  const [deletedTodo] = state.data.todos.splice(originalIndex, 1);

  clearUndoTimer();
  state.ui.pendingDelete = {
    todo: deletedTodo,
    originalIndex,
    expiresAt: Date.now() + UNDO_TIMEOUT_MS,
  };

  if (state.ui.editingTodoId === todoId) {
    state.ui.editingTodoId = null;
  }

  commitDataChange("할 일을 삭제했습니다.");
  showUndoToast(deletedTodo.title);

  state.ui.undoTimerId = window.setTimeout(() => {
    clearPendingDelete();
  }, UNDO_TIMEOUT_MS);

  return state.ui.pendingDelete;
}

function restoreDeletedTodo() {
  const pendingDelete = state.ui.pendingDelete;

  if (!pendingDelete || Date.now() > pendingDelete.expiresAt) {
    clearPendingDelete();
    return false;
  }

  const insertIndex = Math.min(
    pendingDelete.originalIndex,
    state.data.todos.length,
  );

  state.data.todos.splice(insertIndex, 0, pendingDelete.todo);
  clearPendingDelete();
  commitDataChange("삭제한 할 일을 복구했습니다.");
  return true;
}

function clearUndoTimer() {
  if (state.ui.undoTimerId !== null) {
    window.clearTimeout(state.ui.undoTimerId);
    state.ui.undoTimerId = null;
  }
}

function clearPendingDelete() {
  clearUndoTimer();
  state.ui.pendingDelete = null;
  undoToast.hidden = true;
}

// ============================================================
// 6. 조회와 UI 상태 함수
// ============================================================

function getVisibleTodos() {
  switch (state.ui.filter) {
    case "active":
      return state.data.todos.filter((todo) => !todo.completed);
    case "completed":
      return state.data.todos.filter((todo) => todo.completed);
    default:
      return state.data.todos;
  }
}

function getRemainingTodoCount() {
  return state.data.todos.filter((todo) => !todo.completed).length;
}

function setFilter(filter) {
  if (!VALID_FILTERS.has(filter)) {
    return;
  }

  state.ui.filter = filter;
  state.ui.editingTodoId = null;
  render();
}

function startEditingTodo(todoId) {
  if (!findTodoById(todoId)) {
    return;
  }

  state.ui.editingTodoId = todoId;
  render();

  const editInput = todoList.querySelector(`[data-edit-input="${todoId}"]`);
  editInput?.focus();
  editInput?.select();
}

function cancelEditingTodo() {
  state.ui.editingTodoId = null;
  render();
}

// ============================================================
// 7. 렌더링 함수
// ============================================================

function render() {
  renderTodoList();
  renderRemainingCount();
  renderFilterButtons();
}

function renderTodoList() {
  const visibleTodos = getVisibleTodos();
  todoList.replaceChildren();

  if (visibleTodos.length === 0) {
    todoList.append(createEmptyStateElement());
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const todo of visibleTodos) {
    fragment.append(createTodoElement(todo));
  }

  todoList.append(fragment);
}

function createTodoElement(todo) {
  const todoItem = document.createElement("li");
  todoItem.className = "todo-item";
  todoItem.dataset.todoId = todo.id;

  if (todo.completed) {
    todoItem.classList.add("done");
  }

  const content = document.createElement("div");
  content.className = "todo-content";

  const actions = document.createElement("div");
  actions.className = "todo-actions";

  if (state.ui.editingTodoId === todo.id) {
    const editInput = document.createElement("input");
    editInput.className = "todo-edit-input";
    editInput.type = "text";
    editInput.value = todo.title;
    editInput.maxLength = MAX_TITLE_LENGTH;
    editInput.dataset.editInput = todo.id;
    editInput.setAttribute("aria-label", "할 일 수정 내용");
    content.append(editInput);

    actions.append(
      createActionButton("save", todo.id, "저장", "save-button"),
      createActionButton("cancel", todo.id, "취소", "cancel-button"),
    );
  } else {
    const title = document.createElement("span");
    title.className = "todo-title";
    title.textContent = todo.title;
    content.append(title);

    actions.append(
      createActionButton(
        "toggle",
        todo.id,
        todo.completed ? "완료 취소" : "완료",
        "done-button",
      ),
      createActionButton("edit", todo.id, "수정", "edit-button"),
      createActionButton("delete", todo.id, "삭제", "delete-button"),
    );
  }

  todoItem.append(content, actions);
  return todoItem;
}

function createActionButton(action, todoId, label, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  button.dataset.todoId = todoId;
  button.textContent = label;
  return button;
}

function createEmptyStateElement() {
  const emptyItem = document.createElement("li");
  emptyItem.className = "empty-state";

  const emptyMessages = {
    all: "아직 등록된 할 일이 없습니다.",
    active: "남아 있는 할 일이 없습니다.",
    completed: "완료한 할 일이 없습니다.",
  };

  emptyItem.textContent = emptyMessages[state.ui.filter];
  return emptyItem;
}

function renderRemainingCount() {
  remainingCount.textContent = `남은 할 일 ${getRemainingTodoCount()}개`;
}

function renderFilterButtons() {
  for (const button of filterButtons) {
    const isSelected = button.dataset.filter === state.ui.filter;
    button.setAttribute("aria-pressed", String(isSelected));
  }
}

function showUndoToast(title) {
  undoMessage.textContent = `“${title}” 할 일을 삭제했습니다.`;
  undoToast.hidden = false;
}

function announce(message) {
  statusMessage.textContent = "";

  window.requestAnimationFrame(() => {
    statusMessage.textContent = message;
  });
}

// ============================================================
// 8. 이벤트 처리 함수
// ============================================================

function handleTodoSubmit(event) {
  event.preventDefault();

  const todoTitle = normalizeTitle(todoInput.value);

  if (todoTitle.length === 0) {
    todoInput.setAttribute("aria-invalid", "true");
    announce("할 일을 입력하세요.");
    todoInput.focus();
    return;
  }

  if (todoTitle.length > MAX_TITLE_LENGTH) {
    todoInput.setAttribute("aria-invalid", "true");
    announce(`할 일은 ${MAX_TITLE_LENGTH}자 이하로 입력하세요.`);
    todoInput.focus();
    return;
  }

  todoInput.removeAttribute("aria-invalid");
  const createdTodo = createTodo(todoTitle);

  if (!createdTodo) {
    announce("할 일을 추가하지 못했습니다.");
    return;
  }

  todoInput.value = "";
  todoInput.focus();
}

function handleTodoListClick(event) {
  const button = event.target.closest("button[data-action]");

  if (!button || !todoList.contains(button)) {
    return;
  }

  const { action, todoId } = button.dataset;

  switch (action) {
    case "toggle":
      toggleTodo(todoId);
      break;
    case "edit":
      startEditingTodo(todoId);
      break;
    case "save":
      saveTodoEdit(todoId);
      break;
    case "cancel":
      cancelEditingTodo();
      break;
    case "delete":
      deleteTodo(todoId);
      break;
    default:
      break;
  }
}

function handleTodoListKeydown(event) {
  const editInput = event.target.closest("[data-edit-input]");

  if (!editInput) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    saveTodoEdit(editInput.dataset.editInput);
  }

  if (event.key === "Escape") {
    event.preventDefault();
    cancelEditingTodo();
  }
}

function saveTodoEdit(todoId) {
  const editInput = todoList.querySelector(`[data-edit-input="${todoId}"]`);

  if (!editInput) {
    return;
  }

  const nextTitle = normalizeTitle(editInput.value);

  if (nextTitle.length === 0) {
    editInput.setAttribute("aria-invalid", "true");
    announce("수정할 내용을 입력하세요.");
    editInput.focus();
    return;
  }

  if (!updateTodoTitle(todoId, nextTitle)) {
    editInput.setAttribute("aria-invalid", "true");
    announce("할 일을 수정하지 못했습니다.");
  }
}

function handleFilterClick(event) {
  const button = event.target.closest("button[data-filter]");

  if (!button) {
    return;
  }

  setFilter(button.dataset.filter);
}

// ============================================================
// 9. 앱 초기화
// ============================================================

function initializeApp() {
  state.data = loadPersistentState();

  todoForm.addEventListener("submit", handleTodoSubmit);
  todoList.addEventListener("click", handleTodoListClick);
  todoList.addEventListener("keydown", handleTodoListKeydown);
  document.querySelector(".todo-filters").addEventListener("click", handleFilterClick);
  undoButton.addEventListener("click", restoreDeletedTodo);

  render();
  todoInput.focus();
}

initializeApp();
