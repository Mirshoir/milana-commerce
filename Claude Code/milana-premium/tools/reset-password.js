/* Аварийный сброс пароля админки.
   Запуск из папки проекта:
     node tools/reset-password.js            ← случайный пароль
     node tools/reset-password.js МойПароль  ← свой пароль (мин. 8 символов)
   Разлогинивает все сессии, пишет пароль в консоль и в data/ADMIN-PASSWORD.txt */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, "milana.db"));

const custom = process.argv[2];
if (custom && custom.length < 8) {
  console.error("Пароль должен быть не короче 8 символов.");
  process.exit(1);
}
const password = custom || crypto.randomBytes(5).toString("hex"); // 10 символов
const salt = crypto.randomBytes(16).toString("hex");
const hash = salt + ":" + crypto.scryptSync(password, salt, 64).toString("hex");

db.prepare("INSERT INTO settings (key,value) VALUES ('pass_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(hash);
db.prepare("INSERT INTO settings (key,value) VALUES ('admin_user','admin') ON CONFLICT(key) DO NOTHING").run();
db.prepare("DELETE FROM sessions").run();

const login = db.prepare("SELECT value FROM settings WHERE key='admin_user'").get().value;

fs.writeFileSync(path.join(DATA, "ADMIN-PASSWORD.txt"),
  "MILANA PREMIUM admin panel\r\nLogin: " + login + "\r\nPassword: " + password +
  "\r\n\r\nСмените пароль в Админ > Настройки — файл удалится автоматически.\r\n");

console.log("\n  Логин админки:  " + login);
console.log("  Новый пароль:   " + password);
console.log("  (также сохранены в data/ADMIN-PASSWORD.txt)\n");
