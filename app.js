"use strict";

// ============================================================
// 1. 애플리케이션 계약과 상수
// ============================================================

/**
 * @typedef {Object} Todo
 * @property {string} id
 * @property {string} title
 * @property {boolean} completed
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string|null} completedAt
 */

/**
 * @typedef {Object} PersistentState
 * @property {number} schemaVersion
 * @property {Todo[]} todos
 */

/**
 * @typedef {Object} PendingDelete
 * @property {Todo} todo
 * @property {number} originalIndex
 * @property {number} expiresAt
 */

const STORAGE_KEY = "todo-list-app:state";
const LEGACY_STORAGE_KEYS = ["todoListApp"];
const SCHEMA_VERSION = 1;
const MAX_TITLE_LENGTH = 100;
const UNDO_TIMEOUT_MS = 5000;
const VALID_FILTERS = new Set(["all", "active", "completed"]);
const EMPTY_STATE_MESSAGES = {
  all: "아직 등록된 할 일이 없습니다.",
  active: "남아 있는 할 일이 없습니다.",
  completed: "완료한 할 일이 없습니다.",
};

// ============================================================
// 2. DOM 참조
// ============================================================

const todoForm = document.querySelector("#todoForm");
const todoInput = document.querySelector("#todoInput");
const todoList = document.querySelector("#todoList");
const remainingCount = document.querySelector("#remainingCount");
const filterGroup = document.querySelector("#todoFilters");
const filterButtons = document.querySelectorAll("[data-filter]");
const statusMessage = document.querySelector("#statusMessage");
const undoToast = document.querySelector("#undoToast");
const undoMessage = document.querySelector("#undoMessage");
const undoButton = document.querySelector("#undoButton");

// ============================================================
// 3. 런타임 상태
// ============================================================

const state = {
  data: createDefaultDataState(),
  ui: {
    filter: "all",
    editingTodoId: null,
    /** @type {PendingDelete|null} */
    pendingDelete: null,
    undoTimerId: null,
  },
};

// ============================================================
// 4. 저장소, 스키마 마이그레이션, 데이터 검증
// ============================================================

/** @returns {PersistentState} */
function createDefaultDataState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    todos: [],
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalIsoDate(value) {
  if (typeof value !== "string") {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function normalizeTitle(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidTitle(value) {
  const title = normalizeTitle(value);
  return title.length >= 1 && title.length <= MAX_TITLE_LENGTH;
}

/**
 * 저장 데이터는 사용자가 개발자 도구에서 변경할 수 있으므로 신뢰하지 않는다.
 * 시간 필드의 순서까지 검사해 이후 정렬·통계 기능이 잘못된 데이터를 받지 않게 한다.
 */
function isValidTodo(todo) {
  if (!isRecord(todo) || !isValidTitle(todo.title)) {
    return false;
  }

  if (
    typeof todo.id !== "string" ||
    todo.id.trim().length === 0 ||
    typeof todo.completed !== "boolean" ||
    !isCanonicalIsoDate(todo.createdAt) ||
    !isCanonicalIsoDate(todo.updatedAt)
  ) {
    return false;
  }

  const createdTime = Date.parse(todo.createdAt);
  const updatedTime = Date.parse(todo.updatedAt);

  if (updatedTime < createdTime) {
    return false;
  }

  if (!todo.completed) {
    return todo.completedAt === null;
  }

  if (!isCanonicalIsoDate(todo.completedAt)) {
    return false;
  }

  const completedTime = Date.parse(todo.completedAt);
  return completedTime >= createdTime && completedTime <= updatedTime;
}

/**
 * 새 스키마가 추가되면 버전별 변환을 이 함수에 연결한다.
 * 현재 V1 데이터는 그대로 정제 단계로 전달한다.
 */
function migratePersistentState(value) {
  if (!isRecord(value)) {
    return null;
  }

  switch (value.schemaVersion) {
    case 1:
      return value;
    default:
      return null;
  }
}

/** @returns {PersistentState|null} */
function sanitizePersistentState(value) {
  const migratedState = migratePersistentState(value);

  if (!migratedState || !Array.isArray(migratedState.todos)) {
    return null;
  }

  const usedIds = new Set();
  const todos = [];

  for (const todo of migratedState.todos) {
    if (!isValidTodo(todo) || usedIds.has(todo.id)) {
      continue;
    }

    usedIds.add(todo.id);
    todos.push({
      id: todo.id,
      title: normalizeTitle(todo.title),
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

function migrateStorageKey(data, sourceKey) {
  if (sourceKey === STORAGE_KEY) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.removeItem(sourceKey);
  } catch (error) {
    // 이전 키를 지우기 전에 새 키 저장이 성공해야 데이터 유실이 없다.
    console.warn("기존 Todo 저장 키를 이전하지 못했습니다.", error);
  }
}

/** @returns {PersistentState} */
function loadPersistentState() {
  const storageKeys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];

  for (const storageKey of storageKeys) {
    try {
      const rawData = localStorage.getItem(storageKey);

      if (rawData === null) {
        continue;
      }

      const sanitizedState = sanitizePersistentState(JSON.parse(rawData));

      if (!sanitizedState) {
        continue;
      }

      migrateStorageKey(sanitizedState, storageKey);
      return sanitizedState;
    } catch (error) {
      // 한 키가 손상되어도 다른 레거시 키에서 복구할 수 있도록 탐색을 계속한다.
      console.warn(`Todo 저장 데이터(${storageKey})를 읽지 못했습니다.`, error);
    }
  }

  return createDefaultDataState();
}

function savePersistentState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(legacyKey);
    }

    return true;
  } catch (error) {
    console.error("Todo 데이터를 저장하지 못했습니다.", error);
    return false;
  }
}

/**
 * 데이터 변경 후 저장과 렌더링을 한 경로로 모아 화면과 저장소의 불일치를 줄인다.
 * 저장 실패 시 변경 내용은 현재 탭에서 유지하되, 새로고침 시 사라질 수 있음을 알린다.
 */
function commitDataChange(successMessage = "") {
  const isSaved = savePersistentState();
  render();

  if (!isSaved) {
    announce("변경 내용은 현재 화면에만 반영되었습니다. 브라우저 저장 공간을 확인하세요.");
    return false;
  }

  if (successMessage) {
    announce(successMessage);
  }

  return true;
}

// ============================================================
// 5. Todo 데이터 변경 함수
// ============================================================

function createTodoId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // 구형 브라우저용 폴백이며, 서버 동기화 도입 시 서버 발급 ID로 대체한다.
  return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTodo(title) {
  const normalizedTitle = normalizeTitle(title);

  if (!isValidTitle(normalizedTitle)) {
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

  if (!todo || !isValidTitle(normalizedTitle)) {
    return false;
  }

  if (todo.title === normalizedTitle) {
    state.ui.editingTodoId = null;
    render();
    announce("변경된 내용이 없습니다.");
    return true;
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

  // 실행 취소는 가장 최근 삭제 한 건만 지원한다. V2 휴지통 도입 시 영구 데이터로 분리한다.
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

  state.ui.undoTimerId = window.setTimeout(clearPendingDelete, UNDO_TIMEOUT_MS);
  return state.ui.pendingDelete;
}

function restoreDeletedTodo() {
  const pendingDelete = state.ui.pendingDelete;

  if (!pendingDelete || Date.now() > pendingDelete.expiresAt) {
    clearPendingDelete();
    return false;
  }

  const insertIndex = Math.min(pendingDelete.originalIndex, state.data.todos.length);
  state.data.todos.splice(insertIndex, 0, pendingDelete.todo);

  clearPendingDelete();
  commitDataChange("삭제한 할 일을 복구했습니다.");
  return true;
}

function clearUndoTimer() {
  if (state.ui.undoTimerId === null) {
    return;
  }

  window.clearTimeout(state.ui.undoTimerId);
  state.ui.undoTimerId = null;
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
    return false;
  }

  state.ui.filter = filter;
  state.ui.editingTodoId = null;
  render();
  return true;
}

function startEditingTodo(todoId) {
  if (!findTodoById(todoId)) {
    return false;
  }

  state.ui.editingTodoId = todoId;
  render();

  const editInput = todoList.querySelector(`[data-edit-input="${todoId}"]`);
  editInput?.focus();
  editInput?.select();
  return true;
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
  todoItem.classList.toggle("done", todo.completed);

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
    // 사용자 입력은 HTML로 해석되지 않도록 항상 textContent로 출력한다.
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
  emptyItem.textContent = EMPTY_STATE_MESSAGES[state.ui.filter];
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
// 8. 입력 검증과 이벤트 처리
// ============================================================

function readValidatedTitle(input, emptyMessage) {
  const title = normalizeTitle(input.value);
  let errorMessage = "";

  if (title.length === 0) {
    errorMessage = emptyMessage;
  } else if (title.length > MAX_TITLE_LENGTH) {
    errorMessage = `할 일은 ${MAX_TITLE_LENGTH}자 이하로 입력하세요.`;
  }

  if (errorMessage) {
    input.setAttribute("aria-invalid", "true");
    announce(errorMessage);
    input.focus();
    return null;
  }

  input.removeAttribute("aria-invalid");
  return title;
}

function handleTodoSubmit(event) {
  event.preventDefault();

  const todoTitle = readValidatedTitle(todoInput, "할 일을 입력하세요.");

  if (todoTitle === null || !createTodo(todoTitle)) {
    return;
  }

  todoInput.value = "";
  todoInput.focus();
}

/**
 * 목록 전체에 리스너 하나만 두는 이벤트 위임 방식이다.
 * 렌더링으로 버튼이 교체되어도 리스너를 다시 등록할 필요가 없다.
 */
function handleTodoListClick(event) {
  const button = event.target.closest?.("button[data-action]");

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
  const editInput = event.target.closest?.("[data-edit-input]");

  if (!editInput) {
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    saveTodoEdit(editInput.dataset.editInput);
  } else if (event.key === "Escape") {
    event.preventDefault();
    cancelEditingTodo();
  }
}

function saveTodoEdit(todoId) {
  const editInput = todoList.querySelector(`[data-edit-input="${todoId}"]`);

  if (!editInput) {
    return;
  }

  const nextTitle = readValidatedTitle(editInput, "수정할 내용을 입력하세요.");

  if (nextTitle !== null && !updateTodoTitle(todoId, nextTitle)) {
    editInput.setAttribute("aria-invalid", "true");
    announce("할 일을 수정하지 못했습니다.");
  }
}

function handleFilterClick(event) {
  const button = event.target.closest?.("button[data-filter]");

  if (!button || !filterGroup.contains(button)) {
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
  filterGroup.addEventListener("click", handleFilterClick);
  undoButton.addEventListener("click", restoreDeletedTodo);

  render();
  todoInput.focus();
}

initializeApp();
