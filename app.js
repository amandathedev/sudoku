/* Sudoku — tiny dependency-free web app */

const SIZE = 9;
const BOX = 3;
const STORAGE_KEY = "sudoku-state-v1";
const THEME_KEY = "sudoku-theme-v1";

const DIFFICULTY = {
  easy: { clues: 40, label: "Easy" },
  medium: { clues: 32, label: "Medium" },
  hard: { clues: 26, label: "Hard" },
};

/** @typedef {"easy" | "medium" | "hard"} Difficulty */
/** @typedef {{ instantConflicts: boolean, countMistakes: boolean }} Settings */

/** @type {{
 * puzzle: number[][],
 * solution: number[][],
 * user: number[][],
 * fixed: boolean[][],
 * difficulty: Difficulty,
 * startedAtMs: number,
 * elapsedMs: number,
 * mistakes: number,
 * selected: {r:number, c:number} | null,
 * completed: boolean,
 * }} */
let state;

let timerId = null;

const els = {
  board: /** @type {HTMLElement} */ (document.getElementById("board")),
  newGameBtn: /** @type {HTMLButtonElement} */ (document.getElementById("newGameBtn")),
  checkBtn: /** @type {HTMLButtonElement} */ (document.getElementById("checkBtn")),
  hintBtn: /** @type {HTMLButtonElement} */ (document.getElementById("hintBtn")),
  clearBtn: /** @type {HTMLButtonElement} */ (document.getElementById("clearBtn")),
  solveBtn: /** @type {HTMLButtonElement} */ (document.getElementById("solveBtn")),
  timeLabel: /** @type {HTMLElement} */ (document.getElementById("timeLabel")),
  mistakesLabel: /** @type {HTMLElement} */ (document.getElementById("mistakesLabel")),
  progressLabel: /** @type {HTMLElement} */ (document.getElementById("progressLabel")),
  toast: /** @type {HTMLElement} */ (document.getElementById("toast")),
  themeBtn: /** @type {HTMLButtonElement} */ (document.getElementById("themeBtn")),
  resetSaveBtn: /** @type {HTMLButtonElement} */ (document.getElementById("resetSaveBtn")),
  instantConflictsToggle: /** @type {HTMLInputElement} */ (document.getElementById("instantConflictsToggle")),
  mistakesToggle: /** @type {HTMLInputElement} */ (document.getElementById("mistakesToggle")),
};

const difficultyInputs = /** @type {NodeListOf<HTMLInputElement>} */ (
  document.querySelectorAll('input[name="difficulty"]')
);

// ---------- Utility ----------

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function deepCopyBoard(b) {
  return b.map((row) => row.slice());
}

function makeEmptyBoard() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function boxStart(i) {
  return Math.floor(i / BOX) * BOX;
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function toast(msg, kind = "info") {
  // kind: info | ok | warn | bad
  const el = els.toast;
  el.hidden = false;
  el.textContent = msg;
  el.style.borderColor =
    kind === "ok"
      ? "rgba(35,196,131,.35)"
      : kind === "warn"
        ? "rgba(255,176,32,.35)"
        : kind === "bad"
          ? "rgba(255,59,92,.35)"
          : "rgba(124,92,255,.30)";
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => {
    el.hidden = true;
  }, 2200);
}
toast._t = 0;

// ---------- Sudoku core ----------

function isValid(board, r, c, n) {
  // row
  for (let x = 0; x < SIZE; x++) if (board[r][x] === n) return false;
  // col
  for (let y = 0; y < SIZE; y++) if (board[y][c] === n) return false;
  // box
  const br = boxStart(r);
  const bc = boxStart(c);
  for (let y = br; y < br + BOX; y++) {
    for (let x = bc; x < bc + BOX; x++) {
      if (board[y][x] === n) return false;
    }
  }
  return true;
}

function findEmpty(board) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) return { r, c };
    }
  }
  return null;
}

function solveBoard(board) {
  const spot = findEmpty(board);
  if (!spot) return true;
  const { r, c } = spot;
  for (const n of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (!isValid(board, r, c, n)) continue;
    board[r][c] = n;
    if (solveBoard(board)) return true;
    board[r][c] = 0;
  }
  return false;
}

function countSolutions(board, limit = 2) {
  // Returns number of solutions up to `limit` (early exit).
  const spot = findEmpty(board);
  if (!spot) return 1;
  let count = 0;
  const { r, c } = spot;
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    if (!isValid(board, r, c, n)) continue;
    board[r][c] = n;
    count += countSolutions(board, limit - count);
    board[r][c] = 0;
    if (count >= limit) return count;
  }
  return count;
}

function generateSolvedBoard() {
  const b = makeEmptyBoard();
  // Seed diagonal boxes to speed up generation.
  for (let k = 0; k < SIZE; k += BOX) {
    const nums = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    let i = 0;
    for (let r = k; r < k + BOX; r++) {
      for (let c = k; c < k + BOX; c++) {
        b[r][c] = nums[i++];
      }
    }
  }
  solveBoard(b);
  return b;
}

function makePuzzleFromSolution(solution, cluesTarget) {
  const puzzle = deepCopyBoard(solution);
  let filled = SIZE * SIZE;
  const coords = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) coords.push({ r, c });
  const order = shuffled(coords);

  // Try to remove symmetrically for nicer puzzles.
  for (const { r, c } of order) {
    if (filled <= cluesTarget) break;
    const r2 = SIZE - 1 - r;
    const c2 = SIZE - 1 - c;

    const pairs = r === r2 && c === c2 ? [{ r, c }] : [{ r, c }, { r: r2, c: c2 }];
    const removed = [];

    // Already empty? skip.
    let canTry = true;
    for (const p of pairs) {
      if (puzzle[p.r][p.c] === 0) {
        canTry = false;
        break;
      }
    }
    if (!canTry) continue;

    for (const p of pairs) {
      removed.push({ ...p, v: puzzle[p.r][p.c] });
      puzzle[p.r][p.c] = 0;
    }

    const tmp = deepCopyBoard(puzzle);
    const solCount = countSolutions(tmp, 2);
    if (solCount !== 1) {
      // revert if not uniquely solvable
      for (const p of removed) puzzle[p.r][p.c] = p.v;
      continue;
    }

    filled -= removed.length;
  }

  return puzzle;
}

function computeFixed(puzzle) {
  return puzzle.map((row) => row.map((v) => v !== 0));
}

function isComplete(user) {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (user[r][c] === 0) return false;
  return true;
}

function countFilled(user) {
  let n = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (user[r][c] !== 0) n++;
  return n;
}

function hasConflict(board, r, c) {
  const n = board[r][c];
  if (n === 0) return false;
  // row
  for (let x = 0; x < SIZE; x++) if (x !== c && board[r][x] === n) return true;
  // col
  for (let y = 0; y < SIZE; y++) if (y !== r && board[y][c] === n) return true;
  // box
  const br = boxStart(r);
  const bc = boxStart(c);
  for (let y = br; y < br + BOX; y++) {
    for (let x = bc; x < bc + BOX; x++) {
      if ((y !== r || x !== c) && board[y][x] === n) return true;
    }
  }
  return false;
}

// ---------- Persistence ----------

function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.puzzle || !parsed.solution || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeSave() {
  try {
    const payload = {
      puzzle: state.puzzle,
      solution: state.solution,
      user: state.user,
      fixed: state.fixed,
      difficulty: state.difficulty,
      startedAtMs: state.startedAtMs,
      elapsedMs: state.elapsedMs,
      mistakes: state.mistakes,
      completed: state.completed,
      settings: state.settings,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function resetSave() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ---------- UI rendering ----------

function cellId(r, c) {
  return `cell-${r}-${c}`;
}

function buildBoardDom() {
  els.board.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell";
      btn.setAttribute("role", "gridcell");
      btn.setAttribute("aria-label", `Row ${r + 1}, Column ${c + 1}`);
      btn.dataset.r = String(r);
      btn.dataset.c = String(c);
      btn.id = cellId(r, c);

      // thicker borders
      if (c === 2 || c === 5) btn.classList.add("bR");
      if (r === 2 || r === 5) btn.classList.add("bB");

      btn.addEventListener("click", () => selectCell(r, c, { focus: true }));
      els.board.appendChild(btn);
    }
  }
}

function renderBoard({ showConflicts = true, showSolvedOk = false } = {}) {
  const sel = state.selected;
  const selR = sel ? sel.r : -1;
  const selC = sel ? sel.c : -1;
  const selBoxR = sel ? boxStart(sel.r) : -1;
  const selBoxC = sel ? boxStart(sel.c) : -1;
  const selVal = sel ? state.user[sel.r][sel.c] : 0;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const el = /** @type {HTMLButtonElement} */ (document.getElementById(cellId(r, c)));
      const v = state.user[r][c];

      el.textContent = v === 0 ? "" : String(v);

      el.classList.toggle("fixed", state.fixed[r][c]);
      el.classList.toggle("user", !state.fixed[r][c] && v !== 0);

      const inRow = sel && r === selR;
      const inCol = sel && c === selC;
      const inBox = sel && r >= selBoxR && r < selBoxR + BOX && c >= selBoxC && c < selBoxC + BOX;
      const isSelected = sel && r === selR && c === selC;
      const isMatch = sel && selVal !== 0 && v === selVal && !isSelected;

      el.classList.toggle("hi", !!sel && (inRow || inCol || inBox) && !isSelected);
      el.classList.toggle("match", !!isMatch);
      el.setAttribute("aria-selected", isSelected ? "true" : "false");

      // status
      const conflict = showConflicts && v !== 0 && hasConflict(state.user, r, c);
      el.classList.toggle("err", !!conflict);

      const ok =
        showSolvedOk && v !== 0 && state.solution[r][c] === v && !conflict && !state.fixed[r][c];
      el.classList.toggle("ok", !!ok);
    }
  }

  // stats
  els.mistakesLabel.textContent = String(state.mistakes);
  const filled = countFilled(state.user);
  els.progressLabel.textContent = `${Math.round((filled / 81) * 100)}%`;
}

function selectCell(r, c, { focus } = { focus: false }) {
  state.selected = { r, c };
  renderBoard({ showConflicts: state.settings.instantConflicts, showSolvedOk: false });
  if (focus) {
    const el = /** @type {HTMLElement} */ (document.getElementById(cellId(r, c)));
    el.focus();
  }
  safeSave();
}

function setValueAtSelection(val) {
  if (!state.selected) return;
  const { r, c } = state.selected;
  if (state.fixed[r][c]) return;
  if (state.completed) return;

  const prev = state.user[r][c];
  if (prev === val) return;
  state.user[r][c] = val;

  // mistakes count: only when you place a wrong number (compared to solution)
  // (this is the main "tells you it's wrong" mechanic; conflicts are separate)
  if (state.settings.countMistakes && val !== 0 && val !== state.solution[r][c]) {
    state.mistakes += 1;
    if (state.mistakes >= 3) {
      toast("3 mistakes — solved for you.", "warn");
      solveGame();
      return;
    }
  }

  if (isComplete(state.user)) {
    const correct = isSolvedCorrectly();
    if (correct) {
      state.completed = true;
      toast("You did it!", "ok");
    } else {
      toast("Almost! Some cells are incorrect.", "warn");
    }
  }

  renderBoard({ showConflicts: state.settings.instantConflicts, showSolvedOk: false });
  safeSave();
}

function isSolvedCorrectly() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (state.user[r][c] !== state.solution[r][c]) return false;
    }
  }
  return true;
}

function clearAllUser() {
  if (state.completed) return;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!state.fixed[r][c]) state.user[r][c] = 0;
    }
  }
  toast("Cleared.", "info");
  renderBoard({ showConflicts: state.settings.instantConflicts, showSolvedOk: false });
  safeSave();
}

function checkBoard() {
  if (state.completed) {
    toast("Already completed.", "ok");
    return;
  }
  // show solved cells as green-ish
  renderBoard({ showConflicts: true, showSolvedOk: true });
  const wrong = countWrong();
  if (wrong === 0 && isComplete(state.user)) {
    state.completed = true;
    toast("Perfect!", "ok");
  } else if (wrong === 0) {
    toast("Looking good so far.", "ok");
  } else {
    toast(`${wrong} incorrect cell${wrong === 1 ? "" : "s"} highlighted.`, "warn");
  }
  safeSave();
}

function countWrong() {
  let wrong = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = state.user[r][c];
      if (v !== 0 && v !== state.solution[r][c]) wrong++;
    }
  }
  return wrong;
}

function hint() {
  if (state.completed) {
    toast("Already completed.", "ok");
    return;
  }
  // Pick an empty or incorrect non-fixed cell.
  const candidates = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (state.fixed[r][c]) continue;
      const v = state.user[r][c];
      if (v === 0 || v !== state.solution[r][c]) candidates.push({ r, c });
    }
  }
  if (candidates.length === 0) {
    toast("No hints needed.", "ok");
    return;
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  state.user[pick.r][pick.c] = state.solution[pick.r][pick.c];
  selectCell(pick.r, pick.c, { focus: true });
  toast("Hint placed.", "ok");
  if (isSolvedCorrectly()) {
    state.completed = true;
    toast("Completed!", "ok");
  }
  renderBoard({ showConflicts: true, showSolvedOk: false });
  safeSave();
}

function solveGame() {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) state.user[r][c] = state.solution[r][c];
  state.completed = true;
  renderBoard({ showConflicts: false, showSolvedOk: true });
  safeSave();
}

// ---------- Timer ----------

function stopTimer() {
  if (timerId) window.clearInterval(timerId);
  timerId = null;
}

function startTimer() {
  stopTimer();
  // paint immediately
  els.timeLabel.textContent = formatTime(state.elapsedMs);
  timerId = window.setInterval(() => {
    const now = Date.now();
    const elapsed = state.elapsedMs + (now - state.startedAtMs);
    els.timeLabel.textContent = formatTime(elapsed);
  }, 250);
}

function commitElapsed() {
  const now = Date.now();
  state.elapsedMs += now - state.startedAtMs;
  state.startedAtMs = now;
}

// ---------- Game lifecycle ----------

/** @param {Difficulty} difficulty */
function newGame(difficulty) {
  stopTimer();
  toast("Generating puzzle…", "info");

  // Generate synchronously (fast enough for 9x9); still keep UI responsive.
  window.setTimeout(() => {
    const solved = generateSolvedBoard();
    const cluesTarget = DIFFICULTY[difficulty].clues;
    const puzzle = makePuzzleFromSolution(solved, cluesTarget);

    state = {
      puzzle,
      solution: solved,
      user: deepCopyBoard(puzzle),
      fixed: computeFixed(puzzle),
      difficulty,
      settings: state?.settings ?? { instantConflicts: true, countMistakes: true },
      startedAtMs: Date.now(),
      elapsedMs: 0,
      mistakes: 0,
      selected: { r: 0, c: 0 },
      completed: false,
    };

    buildBoardDom();
    syncSettingsUi();
    renderBoard({ showConflicts: state.settings.instantConflicts, showSolvedOk: false });
    selectFirstEditable();
    startTimer();
    safeSave();
    toast(`${DIFFICULTY[difficulty].label} puzzle ready.`, "ok");
  }, 20);
}

function selectFirstEditable() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!state.fixed[r][c]) {
        selectCell(r, c, { focus: true });
        return;
      }
    }
  }
  selectCell(0, 0, { focus: true });
}

function loadOrCreate() {
  const saved = safeLoad();
  if (saved) {
    // Basic sanity checks
    const diff = saved.difficulty && DIFFICULTY[saved.difficulty] ? saved.difficulty : "easy";
    state = {
      puzzle: saved.puzzle,
      solution: saved.solution,
      user: saved.user,
      fixed: saved.fixed || computeFixed(saved.puzzle),
      difficulty: diff,
      settings: saved.settings || { instantConflicts: true, countMistakes: true },
      startedAtMs: Date.now(),
      elapsedMs: typeof saved.elapsedMs === "number" ? saved.elapsedMs : 0,
      mistakes: typeof saved.mistakes === "number" ? saved.mistakes : 0,
      selected: { r: 0, c: 0 },
      completed: !!saved.completed,
    };
    buildBoardDom();
    syncSettingsUi();
    renderBoard({ showConflicts: state.settings.instantConflicts, showSolvedOk: state.completed });
    // restore difficulty UI
    for (const input of difficultyInputs) input.checked = input.value === diff;
    selectFirstEditable();
    startTimer();
    toast("Restored your last game.", "ok");
    return;
  }
  newGame(getSelectedDifficulty());
}

function syncSettingsUi() {
  if (!els.instantConflictsToggle || !els.mistakesToggle) return;
  els.instantConflictsToggle.checked = !!state.settings.instantConflicts;
  els.mistakesToggle.checked = !!state.settings.countMistakes;
}

function getSelectedDifficulty() {
  const el = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="difficulty"]:checked'));
  const v = el ? el.value : "easy";
  return /** @type {Difficulty} */ (v);
}

// ---------- Input handling ----------

function moveSelection(dr, dc) {
  if (!state.selected) return;
  const r = clamp(state.selected.r + dr, 0, 8);
  const c = clamp(state.selected.c + dc, 0, 8);
  selectCell(r, c, { focus: true });
}

function handleKeyDown(e) {
  const k = e.key;
  if (k === "ArrowUp") return e.preventDefault(), moveSelection(-1, 0);
  if (k === "ArrowDown") return e.preventDefault(), moveSelection(1, 0);
  if (k === "ArrowLeft") return e.preventDefault(), moveSelection(0, -1);
  if (k === "ArrowRight") return e.preventDefault(), moveSelection(0, 1);

  if (k === "Backspace" || k === "Delete" || k === "0") {
    e.preventDefault();
    setValueAtSelection(0);
    return;
  }

  if (/^[1-9]$/.test(k)) {
    e.preventDefault();
    setValueAtSelection(Number(k));
    return;
  }

  if (k === "Enter") {
    e.preventDefault();
    checkBoard();
  }
}

function bindKeypad() {
  const keys = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll(".keypad .key"));
  for (const btn of keys) {
    btn.addEventListener("click", () => {
      const k = btn.dataset.key;
      if (!k) return;
      if (k === "erase") setValueAtSelection(0);
      else setValueAtSelection(Number(k));
    });
  }
}

// ---------- Theme ----------

function getTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

// ---------- Wire up ----------

function wireEvents() {
  document.addEventListener("keydown", handleKeyDown);

  els.newGameBtn.addEventListener("click", () => {
    const d = getSelectedDifficulty();
    newGame(d);
  });
  els.clearBtn.addEventListener("click", clearAllUser);
  els.checkBtn.addEventListener("click", checkBoard);
  els.hintBtn.addEventListener("click", hint);
  els.solveBtn.addEventListener("click", () => {
    if (!confirm("Reveal the full solution?")) return;
    solveGame();
    toast("Solved.", "info");
  });

  for (const input of difficultyInputs) {
    input.addEventListener("change", () => {
      const d = getSelectedDifficulty();
      // Make difficulty feel responsive: switching difficulty immediately starts a new puzzle.
      // (Otherwise it only affects the next "New game" and can look like it does nothing.)
      if (state) {
        newGame(d);
      } else {
        toast(`Difficulty set to ${DIFFICULTY[d].label}.`, "info");
      }
    });
  }

  els.themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(next);
    toast(`${next === "dark" ? "Dark" : "Light"} theme.`, "ok");
  });

  els.resetSaveBtn.addEventListener("click", () => {
    if (!confirm("Delete the saved game?")) return;
    resetSave();
    toast("Save reset.", "info");
  });

  // Settings
  if (els.instantConflictsToggle) {
    els.instantConflictsToggle.addEventListener("change", () => {
      state.settings.instantConflicts = els.instantConflictsToggle.checked;
      renderBoard({ showConflicts: state.settings.instantConflicts, showSolvedOk: false });
      safeSave();
    });
  }
  if (els.mistakesToggle) {
    els.mistakesToggle.addEventListener("change", () => {
      state.settings.countMistakes = els.mistakesToggle.checked;
      safeSave();
    });
  }

  window.addEventListener("beforeunload", () => {
    commitElapsed();
    safeSave();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      commitElapsed();
      safeSave();
    } else {
      state.startedAtMs = Date.now();
    }
  });
}

function init() {
  setTheme(getTheme());
  wireEvents();
  bindKeypad();
  loadOrCreate();
}

init();


