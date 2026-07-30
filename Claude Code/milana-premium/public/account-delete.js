"use strict";

const form = document.getElementById("delete-account-form");
const emailInput = document.getElementById("delete-email");
const codeButton = document.getElementById("send-delete-code");
const message = document.getElementById("delete-message");

function showMessage(text, good = false) {
  message.textContent = text;
  message.classList.toggle("good", good);
}

async function request(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "request_failed");
  return result;
}

codeButton.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!emailInput.checkValidity()) {
    emailInput.reportValidity();
    return;
  }
  codeButton.disabled = true;
  showMessage("Sending a verification code...");
  try {
    const result = await request("/api/auth/email-otp/start", {
      email,
      lang: document.documentElement.lang || "en",
      purpose: "account_deletion",
    });
    showMessage(result.dev_code
      ? `Development code: ${result.dev_code}`
      : "The code was sent to your email. It expires in 10 minutes.", true);
  } catch (error) {
    showMessage(`Could not send the code (${error.message}).`);
  } finally {
    codeButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const body = Object.fromEntries(new FormData(form));
  if (body.confirmation.trim().toUpperCase() !== "DELETE") {
    showMessage("Type DELETE exactly to confirm.");
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  showMessage("Deleting your account...");
  try {
    await request("/api/auth/account/delete-with-code", body);
    form.reset();
    form.querySelectorAll("input,button").forEach((element) => { element.disabled = true; });
    showMessage("Your Milana Premium account has been deleted.", true);
  } catch (error) {
    showMessage(`The account could not be deleted (${error.message}).`);
    submit.disabled = false;
  }
});
