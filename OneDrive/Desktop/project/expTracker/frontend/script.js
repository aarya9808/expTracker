const addExpenseButton = document.getElementById("addExpense");
const itemInput = document.getElementById("item_name");
const amountInput = document.getElementById("amount");
const expenseList = document.getElementById("expenseList");
const totalAmount = document.getElementById("totalAmount");

function fetchExpenses() {
  fetch("http://localhost:3000/expenses")
    .then((response) => response.json())
    .then((data) => {
      updateUI(data);
    })
    .catch((error) => console.error("Error fetching expenses:", error));
}

// Function to add an expense
function addExpense() {
  const item_name = itemInput.value.trim();
  const amount = parseFloat(amountInput.value.trim());

  const expense = { item_name, amount };

  fetch("http://localhost:3000/expenses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(expense),
  })
    .then((response) => response.json())
    .then((data) => {
      fetchExpenses(); 
      itemInput.value = ""; // Clear input fields
      amountInput.value = "";
    })
    .catch((error) => console.error("Error adding expense:", error));
}

// Function to delete an expense
function deleteExpense(id) {
  fetch(`http://localhost:3000/expenses/${id}`, {
    method: "DELETE",
  })
    .then((response) => response.json())
    .then((data) => {
      fetchExpenses(); 
    })
    .catch((error) => console.error("Error deleting expense:", error));
}

// Function to update UI 
function updateUI(expenses) {
  expenseList.innerHTML = ""; 
  let total = 0;

  expenses.forEach((expense) => {
    total += expense.amount;

    const li = document.createElement("li");
    li.innerHTML = `${expense.item_name} - Rs. ${expense.amount} <button onclick="deleteExpense('${expense.id}')">Delete</button>`;
    expenseList.appendChild(li);
  });

  totalAmount.textContent = total.toFixed(2);
}


fetchExpenses();

addExpenseButton.addEventListener("click", addExpense);

itemInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    addExpense();
  }
});
