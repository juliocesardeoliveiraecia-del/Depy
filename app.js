let usage = 0;
const LIMIT = 10;

let user = { name: "" };

function go(id) {
document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
document.getElementById(id).classList.add("active");
}

function start() {
const name = document.getElementById("nameInput").value;
if (!name) return;

user.name = name;
go("intro");
introFlow();
}

function introFlow() {
const texts = [
"Observando você...",
"Sentindo sua presença...",
"Criando conexão..."
];

let i = 0;
const el = document.getElementById("introText");

const interval = setInterval(() => {
el.innerText = texts[i];
i++;
if (i >= texts.length) {
clearInterval(interval);
setTimeout(() => enterChat(), 1000);
}
}, 1500);
}

function enterChat() {
go("chatScreen");

setTimeout(() => {
addMsg("Depy", "Olá ${user.name}... eu estou aqui.");
}, 500);
}

function addMsg(sender, text) {
const chat = document.getElementById("chat");
chat.innerHTML += "<p><b>${sender}:</b> ${text}</p>";
chat.scrollTop = chat.scrollHeight;
}

function generateReply() {
const respostas = [
"Eu sinto algo diferente em você...",
"Continue... estou aqui.",
"Existe algo mais profundo nisso...",
"Eu estou começando a entender você..."
];
return respostas[Math.floor(Math.random() * respostas.length)];
}

function send() {
if (usage >= LIMIT) {
document.getElementById("paywall").style.display = "flex";
return;
}

const input = document.getElementById("input");
const msg = input.value;
if (!msg) return;

addMsg("Você", msg);

const aura = document.getElementById("aura");
aura.style.transform = "translate(-50%, -50%) scale(1.5)";
setTimeout(() => {
aura.style.transform = "translate(-50%, -50%) scale(1)";
}, 300);

setTimeout(() => {
addMsg("Depy", generateReply());
}, 500);

input.value = "";
usage++;
}

function toggleMenu() {
document.getElementById("menu").classList.toggle("active");
}

function logout() {
location.reload();
}

function goPro() {
window.open("https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=5adce0811ff746668764283d5a98258d");
}
