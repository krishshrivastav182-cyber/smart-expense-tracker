"use strict";

/* =========================
   Constants
========================= */

const DEMO_USERNAME = "krish";
const DEMO_PASSWORD = "expense@2026";

const STORAGE_USERS = "smartExpenseUsers";
const STORAGE_CURRENT_USER = "smartExpenseCurrentUser";
const STORAGE_THEME = "smartExpenseTheme";

let currentUser = null;
let transactions = [];
let notifications = [];
let recurringExpenses = [];
let savingsGoal = null;
let budget = 0;

let editingId = null;
let categoryChart = null;
let monthlyChart = null;
let analyticsCategoryChart = null;
let toastTimer = null;

/* =========================
   Helpers
========================= */

const $ = (id) => document.getElementById(id);

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function todayDate() {
  return new Date().toISOString().split("T")[0];
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function userKey(key) {
  return `smartExpense_${currentUser}_${key}`;
}

function saveUserData() {
  localStorage.setItem(userKey("transactions"), JSON.stringify(transactions));
  localStorage.setItem(userKey("notifications"), JSON.stringify(notifications));
  localStorage.setItem(userKey("recurring"), JSON.stringify(recurringExpenses));
  localStorage.setItem(userKey("goal"), JSON.stringify(savingsGoal));
  localStorage.setItem(userKey("budget"), String(budget));
}

function loadUserData() {
  transactions = JSON.parse(
    localStorage.getItem(userKey("transactions")) || "[]"
  );

  notifications = JSON.parse(
    localStorage.getItem(userKey("notifications")) || "[]"
  );

  recurringExpenses = JSON.parse(
    localStorage.getItem(userKey("recurring")) || "[]"
  );

  savingsGoal = JSON.parse(
    localStorage.getItem(userKey("goal")) || "null"
  );

  budget = Number(localStorage.getItem(userKey("budget")) || 0);

  processRecurringExpenses();
}

function showToast(message, type = "success") {
  const toast = $("toast");

  toast.textContent = message;
  toast.style.background =
    type === "danger"
      ? "var(--danger)"
      : type === "warning"
      ? "var(--warning)"
      : "var(--success)";

  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function addNotification(message) {
  notifications.unshift({
    id: Date.now(),
    message,
    read: false,
    date: new Date().toISOString()
  });

  notifications = notifications.slice(0, 30);
  saveUserData();
  renderNotifications();
}

function formatDate(date) {
  if (!date) return "-";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function categoryIcon(category) {
  const icons = {
    Food: "🍔",
    Travel: "🚗",
    Shopping: "🛍️",
    Bills: "💡",
    Education: "📚",
    Health: "🏥",
    Entertainment: "🎬",
    Other: "📌"
  };

  return icons[category] || "📌";
}

/* =========================
   User Management
========================= */

function getUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_USERS) || "[]");
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
}

function initializeUsers() {
  const users = getUsers();

  if (!users.some((user) => user.username === DEMO_USERNAME)) {
    users.push({
      username: DEMO_USERNAME,
      password: DEMO_PASSWORD
    });

    saveUsers(users);
  }
}

function login(username, password) {
  const users = getUsers();

  const validUser = users.find(
    (user) =>
      user.username.toLowerCase() === username.toLowerCase() &&
      user.password === password
  );

  if (!validUser) {
    $("loginError").textContent = "Invalid username or password.";
    return;
  }

  currentUser = validUser.username;

  localStorage.setItem(STORAGE_CURRENT_USER, currentUser);

  loadUserData();

  $("loginPage").classList.add("hidden");
  $("dashboardPage").classList.remove("hidden");

  $("displayUser").textContent = currentUser;
  $("settingsUser").textContent = currentUser;

  $("loginError").textContent = "";

  renderAll();
  showToast(`Welcome, ${currentUser}!`);
}

function logout() {
  localStorage.removeItem(STORAGE_CURRENT_USER);

  currentUser = null;
  transactions = [];
  notifications = [];
  recurringExpenses = [];
  savingsGoal = null;
  budget = 0;

  $("dashboardPage").classList.add("hidden");
  $("loginPage").classList.remove("hidden");

  $("loginForm").reset();
}

function registerUser() {
  const username = prompt("Enter new username:");
  const password = prompt("Enter new password:");

  if (!username || !password) {
    showToast("Username and password are required.", "warning");
    return;
  }

  const users = getUsers();

  if (
    users.some(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    )
  ) {
    showToast("Username already exists.", "danger");
    return;
  }

  users.push({ username, password });
  saveUsers(users);

  showToast("Account created. You can now login.");
}

/* =========================
   Transactions
========================= */

function getTotals() {
  const income = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  const expenses = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  return {
    income,
    expenses,
    balance: income - expenses
  };
}

function getMonthlyExpenses() {
  const currentMonth = new Date().toISOString().slice(0, 7);

  return transactions
    .filter(
      (transaction) =>
        transaction.type === "expense" &&
        transaction.date.startsWith(currentMonth)
    )
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
}

function saveTransaction(event) {
  event.preventDefault();

  const title = $("transactionTitle").value.trim();
  const amount = Number($("transactionAmount").value);
  const type = $("transactionType").value;
  const category = $("transactionCategory").value;
  const date = $("transactionDate").value;
  const note = $("transactionNote").value.trim();
  const receiptFile = $("transactionReceipt").files[0];

  if (!title || !amount || amount <= 0 || !date) {
    showToast("Please fill all required fields.", "warning");
    return;
  }

  const finishSave = (receipt = "") => {
    const transactionData = {
      id: editingId || Date.now(),
      title,
      amount,
      type,
      category,
      date,
      note,
      receipt,
      updatedAt: new Date().toISOString()
    };

    if (editingId) {
      transactions = transactions.map((transaction) =>
        transaction.id === editingId ? transactionData : transaction
      );

      showToast("Transaction updated.");
    } else {
      transactions.push(transactionData);

      if (type === "expense" && amount >= 5000) {
        addNotification(`Large expense added: ${title} - ${money(amount)}`);
      }

      showToast("Transaction added.");
    }

    saveUserData();
    closeModal();
    renderAll();
  };

  if (receiptFile) {
    if (receiptFile.size > 2 * 1024 * 1024) {
      showToast("Receipt must be smaller than 2 MB.", "warning");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => finishSave(reader.result);
    reader.readAsDataURL(receiptFile);
  } else {
    const oldTransaction = transactions.find(
      (transaction) => transaction.id === editingId
    );

    finishSave(oldTransaction?.receipt || "");
  }
}

function editTransaction(id) {
  const transaction = transactions.find(
    (transactionItem) => transactionItem.id === id
  );

  if (!transaction) return;

  editingId = id;

  $("modalTitle").textContent = "Edit Transaction";
  $("transactionTitle").value = transaction.title;
  $("transactionAmount").value = transaction.amount;
  $("transactionType").value = transaction.type;
  $("transactionCategory").value = transaction.category;
  $("transactionDate").value = transaction.date;
  $("transactionNote").value = transaction.note || "";
  $("transactionReceipt").value = "";

  $("transactionModal").classList.remove("hidden");
}

function deleteTransaction(id) {
  const confirmed = confirm("Delete this transaction?");

  if (!confirmed) return;

  transactions = transactions.filter(
    (transaction) => transaction.id !== id
  );

  saveUserData();
  renderAll();
  showToast("Transaction deleted.");
}

function viewReceipt(id) {
  const transaction = transactions.find(
    (transactionItem) => transactionItem.id === id
  );

  if (!transaction || !transaction.receipt) {
    showToast("No receipt available.", "warning");
    return;
  }

  const newWindow = window.open();

  if (!newWindow) {
    showToast("Please allow pop-ups to view receipt.", "warning");
    return;
  }

  if (transaction.receipt.startsWith("data:image")) {
    newWindow.document.write(`
      <title>Receipt - ${escapeHTML(transaction.title)}</title>
      <img src="${transaction.receipt}" style="max-width:100%;height:auto;" />
    `);
  } else {
    newWindow.location.href = transaction.receipt;
  }
}

function transactionHTML(transaction) {
  const sign = transaction.type === "income" ? "+" : "-";

  return `
    <div class="transaction-item">
      <div class="transaction-main">
        <div class="transaction-icon">
          ${categoryIcon(transaction.category)}
        </div>

        <div class="transaction-info">
          <strong>${escapeHTML(transaction.title)}</strong>
          <small>
            ${escapeHTML(transaction.category)}
            • ${formatDate(transaction.date)}
            ${transaction.note ? `• ${escapeHTML(transaction.note)}` : ""}
          </small>
        </div>
      </div>

      <div class="transaction-right">
        <div class="transaction-amount ${transaction.type}">
          ${sign}${money(transaction.amount)}
        </div>

        <div class="transaction-actions">
          ${
            transaction.receipt
              ? `<button onclick="viewReceipt(${transaction.id})">Receipt</button>`
              : ""
          }

          <button onclick="editTransaction(${transaction.id})">
            Edit
          </button>

          <button onclick="deleteTransaction(${transaction.id})">
            Delete
          </button>
        </div>
      </div>
    </div>
  `;
}

/* =========================
   Recurring Expenses
========================= */

function addRecurringExpense() {
  const title = $("recurringTitle").value.trim();
  const amount = Number($("recurringAmount").value);
  const frequency = $("recurringFrequency").value;

  if (!title || !amount || amount <= 0) {
    showToast("Enter valid recurring expense details.", "warning");
    return;
  }

  recurringExpenses.push({
    id: Date.now(),
    title,
    amount,
    frequency,
    nextDate: todayDate(),
    active: true
  });

  saveUserData();

  $("recurringTitle").value = "";
  $("recurringAmount").value = "";

  renderRecurringExpenses();
  showToast("Recurring expense added.");
}

function getNextDate(date, frequency) {
  const next = new Date(`${date}T00:00:00`);

  if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (frequency === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString().split("T")[0];
}

function processRecurringExpenses() {
  const currentDate = todayDate();
  let changed = false;

  recurringExpenses.forEach((recurring) => {
    if (!recurring.active) return;

    while (recurring.nextDate <= currentDate) {
      transactions.push({
        id: Date.now() + Math.random(),
        title: recurring.title,
        amount: recurring.amount,
        type: "expense",
        category: "Bills",
        date: recurring.nextDate,
        note: `Recurring ${recurring.frequency} expense`,
        receipt: "",
        recurringId: recurring.id
      });

      recurring.nextDate = getNextDate(
        recurring.nextDate,
        recurring.frequency
      );

      changed = true;
    }
  });

  if (changed) {
    saveUserData();
  }
}

function deleteRecurringExpense(id) {
  recurringExpenses = recurringExpenses.filter(
    (recurring) => recurring.id !== id
  );

  saveUserData();
  renderRecurringExpenses();
  showToast("Recurring expense removed.");
}

function renderRecurringExpenses() {
  const container = $("recurringList");

  if (!recurringExpenses.length) {
    container.innerHTML = `<p class="empty-state">No recurring expenses added.</p>`;
    return;
  }

  container.innerHTML = recurringExpenses
    .map(
      (recurring) => `
        <div class="recurring-item">
          <div>
            <strong>${escapeHTML(recurring.title)}</strong>
            <small>
              ${money(recurring.amount)} • ${recurring.frequency}
              • Next: ${formatDate(recurring.nextDate)}
            </small>
          </div>

          <button
            class="danger-btn"
            onclick="deleteRecurringExpense(${recurring.id})"
          >
            Delete
          </button>
        </div>
      `
    )
    .join("");
}

/* =========================
   Savings Goal
========================= */

function saveSavingsGoal() {
  const name = $("goalName").value.trim();
  const target = Number($("goalAmount").value);

  if (!name || !target || target <= 0) {
    showToast("Enter valid savings goal details.", "warning");
    return;
  }

  savingsGoal = {
    name,
    target,
    saved: savingsGoal?.saved || 0
  };

  saveUserData();
  renderSavingsGoal();
  showToast("Savings goal saved.");
}

function addSavings() {
  if (!savingsGoal) {
    showToast("Create a savings goal first.", "warning");
    return;
  }

  const amount = Number(prompt("Enter amount saved:"));

  if (!amount || amount <= 0) {
    showToast("Enter a valid amount.", "warning");
    return;
  }

  savingsGoal.saved += amount;

  saveUserData();
  renderSavingsGoal();
  showToast("Savings updated.");
}

function renderSavingsGoal() {
  const container = $("goalProgress");

  if (!savingsGoal) {
    container.innerHTML = "No goal set";
    return;
  }

  const percentage = Math.min(
    100,
    (savingsGoal.saved / savingsGoal.target) * 100
  );

  container.innerHTML = `
    <div style="width:100%;">
      <strong>${escapeHTML(savingsGoal.name)}</strong>
      <p style="margin:8px 0;">
        ${money(savingsGoal.saved)} of ${money(savingsGoal.target)}
        (${percentage.toFixed(1)}%)
      </p>

      <div class="budget-progress">
        <div
          style="
            width:${percentage}%;
            height:12px;
            border-radius:20px;
            background:linear-gradient(90deg,var(--success),var(--primary));
          "
        ></div>
      </div>

      <button
        class="primary-btn"
        style="margin-top:12px;"
        onclick="addSavings()"
      >
        + Add Savings
      </button>
    </div>
  `;
}

/* =========================
   Rendering
========================= */

function renderSummary() {
  const totals = getTotals();
  const monthlyExpenses = getMonthlyExpenses();

  $("totalIncome").textContent = money(totals.income);
  $("totalExpense").textContent = money(totals.expenses);
  $("monthlyExpense").textContent = money(monthlyExpenses);

  const budgetSpent = monthlyExpenses;
  const budgetRemaining = budget - budgetSpent;
  const percentage = budget
    ? Math.min(100, (budgetSpent / budget) * 100)
    : 0;

  $("budgetSpent").textContent = money(budgetSpent);
  $("budgetRemaining").textContent = money(budgetRemaining);
  $("budgetProgressBar").style.width = `${percentage}%`;

  $("budgetStatus").textContent = budget
    ? `${percentage.toFixed(1)}% used`
    : "Set your budget";
}

function renderTransactions() {
  const recentContainer = $("recentTransactions");
  const allContainer = $("allTransactions");

  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  const recent = sorted.slice(0, 5);

  recentContainer.innerHTML = recent.length
    ? recent.map(transactionHTML).join("")
    : `<p class="empty-state">No transactions yet.</p>`;

  const search = $("searchInput").value.toLowerCase();
  const category = $("categoryFilter").value;
  const type = $("typeFilter").value;

  const filtered = sorted.filter((transaction) => {
    const matchesSearch =
      transaction.title.toLowerCase().includes(search) ||
      (transaction.note || "").toLowerCase().includes(search);

    const matchesCategory =
      category === "all" || transaction.category === category;

    const matchesType = type === "all" || transaction.type === type;

    return matchesSearch && matchesCategory && matchesType;
  });

  allContainer.innerHTML = filtered.length
    ? filtered.map(transactionHTML).join("")
    : `<p class="empty-state">No matching transactions found.</p>`;
}

function renderNotifications() {
  const unread = notifications.filter(
    (notification) => !notification.read
  ).length;

  $("notificationCount").textContent = unread;

  const container = $("notificationList");

  container.innerHTML = notifications.length
    ? notifications
        .map(
          (notification) => `
            <div class="notification-item">
              ${escapeHTML(notification.message)}
            </div>
          `
        )
        .join("")
    : `<p class="empty-state">No notifications.</p>`;
}

function renderCharts() {
  const expensesByCategory = {};

  transactions
    .filter((transaction) => transaction.type === "expense")
    .forEach((transaction) => {
      expensesByCategory[transaction.category] =
        (expensesByCategory[transaction.category] || 0) +
        Number(transaction.amount);
    });

  const categoryLabels = Object.keys(expensesByCategory);
  const categoryValues = Object.values(expensesByCategory);

  if (categoryChart) categoryChart.destroy();
  if (analyticsCategoryChart) analyticsCategoryChart.destroy();
  if (monthlyChart) monthlyChart.destroy();

  categoryChart = new Chart($("categoryChart"), {
    type: "doughnut",
    data: {
      labels: categoryLabels,
      datasets: [
        {
          data: categoryValues
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: getComputedStyle(document.body)
              .getPropertyValue("--text")
              .trim()
          }
        }
      }
    }
  });

  analyticsCategoryChart = new Chart($("analyticsCategoryChart"), {
    type: "pie",
    data: {
      labels: categoryLabels,
      datasets: [
        {
          data: categoryValues
        }
      ]
    },
    options: {
      responsive: true
    }
  });

  const monthlyData = {};

  transactions.forEach((transaction) => {
    const month = transaction.date.slice(0, 7);

    if (!monthlyData[month]) {
      monthlyData[month] = {
        income: 0,
        expense: 0
      };
    }

    monthlyData[month][transaction.type] += Number(transaction.amount);
  });

  const months = Object.keys(monthlyData).sort();

  monthlyChart = new Chart($("monthlyChart"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "Income",
          data: months.map((month) => monthlyData[month].income)
        },
        {
          label: "Expenses",
          data: months.map((month) => monthlyData[month].expense)
        }
      ]
    },
    options: {
      responsive: true
    }
  });
}

function renderAll() {
  renderSummary();
  renderTransactions();
  renderNotifications();
  renderRecurringExpenses();
  renderSavingsGoal();
  renderCharts();
}

/* =========================
   CSV Export / Import
========================= */

function csvEscape(value) {
  const stringValue = String(value ?? "");

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function exportCSV() {
  const headers = [
    "Title",
    "Amount",
    "Type",
    "Category",
    "Date",
    "Note"
  ];

  const rows = transactions.map((transaction) => [
    transaction.title,
    transaction.amount,
    transaction.type,
    transaction.category,
    transaction.date,
    transaction.note || ""
  ]);

  const csv = [
    headers,
    ...rows
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  downloadFile(
    `${currentUser}-transactions.csv`,
    csv,
    "text/csv;charset=utf-8;"
  );

  showToast("CSV exported.");
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && line[i + 1] === '"' && insideQuotes) {
      current += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function importCSV(event) {
  const file = event.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    const lines = reader.result
      .split(/\r?\n/)
      .filter((line) => line.trim());

    if (lines.length < 2) {
      showToast("CSV file is empty.", "warning");
      return;
    }

    lines.slice(1).forEach((line) => {
      const [
        title,
        amount,
        type,
        category,
        date,
        note
      ] = parseCSVLine(line);

      if (!title || !amount || !date) return;

      transactions.push({
        id: Date.now() + Math.random(),
        title,
        amount: Number(amount),
        type: type === "income" ? "income" : "expense",
        category: category || "Other",
        date,
        note: note || "",
        receipt: ""
      });
    });

    saveUserData();
    renderAll();
    showToast("CSV imported successfully.");
  };

  reader.readAsText(file);
  event.target.value = "";
}

/* =========================
   Excel / PDF Export
========================= */

function exportExcel() {
  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded.", "danger");
    return;
  }

  const rows = transactions.map((transaction) => ({
    Title: transaction.title,
    Amount: transaction.amount,
    Type: transaction.type,
    Category: transaction.category,
    Date: transaction.date,
    Note: transaction.note || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");

  XLSX.writeFile(workbook, `${currentUser}-expense-report.xlsx`);

  showToast("Excel report exported.");
}

function exportPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast("PDF library not loaded.", "danger");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const totals = getTotals();

  doc.setFontSize(18);
  doc.text("Smart Expense Tracker Report", 14, 18);

  doc.setFontSize(11);
  doc.text(`User: ${currentUser}`, 14, 28);
  doc.text(`Total Income: ${money(totals.income)}`, 14, 36);
  doc.text(`Total Expenses: ${money(totals.expenses)}`, 14, 44);
  doc.text(`Balance: ${money(totals.balance)}`, 14, 52);

  let y = 65;

  doc.setFontSize(10);
  doc.text("Title", 14, y);
  doc.text("Amount", 75, y);
  doc.text("Type", 110, y);
  doc.text("Category", 140, y);
  doc.text("Date", 180, y);

  y += 8;

  transactions.forEach((transaction) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }

    doc.text(String(transaction.title).slice(0, 25), 14, y);
    doc.text(money(transaction.amount), 75, y);
    doc.text(transaction.type, 110, y);
    doc.text(transaction.category, 140, y);
    doc.text(transaction.date, 180, y);

    y += 7;
  });

  doc.save(`${currentUser}-expense-report.pdf`);

  showToast("PDF report exported.");
}

/* =========================
   Budget and Theme
========================= */

function saveBudget() {
  const value = Number($("budgetInput").value);

  if (value < 0 || Number.isNaN(value)) {
    showToast("Enter a valid budget.", "warning");
    return;
  }

  budget = value;
  saveUserData();
  renderSummary();
  showToast("Budget saved.");
}

function toggleTheme() {
  document.body.classList.toggle("light-theme");

  const theme = document.body.classList.contains("light-theme")
    ? "light"
    : "dark";

  localStorage.setItem(STORAGE_THEME, theme);

  $("themeToggle").textContent = theme === "light" ? "☀️" : "🌙";

  if (currentUser) renderCharts();
}

function loadTheme() {
  const theme = localStorage.getItem(STORAGE_THEME);

  if (theme === "light") {
    document.body.classList.add("light-theme");
    $("themeToggle").textContent = "☀️";
  }
}

/* =========================
   Modal and Navigation
========================= */

function openModal() {
  editingId = null;

  $("modalTitle").textContent = "Add Transaction";
  $("transactionForm").reset();
  $("transactionDate").value = todayDate();

  $("transactionModal").classList.remove("hidden");
}

function closeModal() {
  editingId = null;
  $("transactionModal").classList.add("hidden");
  $("transactionForm").reset();
}

function showSection(sectionId) {
  document.querySelectorAll(".content-section").forEach((section) => {
    section.classList.add("hidden");
  });

  $(sectionId).classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.section === sectionId
    );
  });
}

/* =========================
   Event Listeners
========================= */

$("loginForm").addEventListener("submit", (event) => {
  event.preventDefault();

  login(
    $("username").value.trim(),
    $("password").value
  );
});

$("togglePassword").addEventListener("click", () => {
  const password = $("password");

  password.type =
    password.type === "password" ? "text" : "password";

  $("togglePassword").textContent =
    password.type === "password" ? "Show" : "Hide";
});

$("openTransactionBtn").addEventListener("click", openModal);
$("openTransactionBtn2").addEventListener("click", openModal);

$("closeModalBtn").addEventListener("click", closeModal);
$("transactionForm").addEventListener("submit", saveTransaction);

$("logoutBtn").addEventListener("click", logout);

$("themeToggle").addEventListener("click", toggleTheme);

$("saveBudgetBtn").addEventListener("click", saveBudget);

$("saveGoalBtn").addEventListener("click", saveSavingsGoal);

$("saveRecurringBtn").addEventListener(
  "click",
  addRecurringExpense
);

$("exportCsvBtn").addEventListener("click", exportCSV);
$("exportExcelBtn").addEventListener("click", exportExcel);
$("exportPdfBtn").addEventListener("click", exportPDF);

$("importCsvInput").addEventListener("change", importCSV);

$("searchInput").addEventListener("input", renderTransactions);
$("categoryFilter").addEventListener("change", renderTransactions);
$("typeFilter").addEventListener("change", renderTransactions);

$("viewAllBtn").addEventListener("click", () => {
  showSection("transactionsSection");
});

$("notificationBtn").addEventListener("click", () => {
  $("notificationPanel").classList.toggle("hidden");
});

$("markReadBtn").addEventListener("click", () => {
  notifications = notifications.map((notification) => ({
    ...notification,
    read: true
  }));

  saveUserData();
  renderNotifications();
});

$("clearDataBtn").addEventListener("click", () => {
  const confirmed = confirm(
    "Are you sure you want to delete all transactions?"
  );

  if (!confirmed) return;

  transactions = [];
  saveUserData();
  renderAll();
  showToast("All transactions cleared.");
});

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    showSection(button.dataset.section);
  });
});

/* =========================
   Live Clock
========================= */

function updateClock() {
  const now = new Date();

  $("liveTime").textContent = now.toLocaleTimeString("en-IN");
  $("liveDate").textContent = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/* =========================
   Initialize App
========================= */

initializeUsers();
loadTheme();
updateClock();

setInterval(updateClock, 1000);

const savedUser = localStorage.getItem(STORAGE_CURRENT_USER);

if (savedUser) {
  currentUser = savedUser;

  $("loginPage").classList.add("hidden");
  $("dashboardPage").classList.remove("hidden");

  $("displayUser").textContent = currentUser;
  $("settingsUser").textContent = currentUser;

  loadUserData();
  renderAll();
}