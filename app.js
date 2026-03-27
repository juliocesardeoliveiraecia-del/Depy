let usage = 0;
const LIMIT = 10;

let user = { name: "" };

/* NAVEGAÇÃO LIMPA */
function go(id) {
document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
document.getElementById(id).classList.add("active");
}

/* INÍCIO */
window.onload = () => {
setTimeout(() => go("home"), 1500);
};

/* CADASTRO */
function goToRegister() {
go("register");
}

function register() {
const name = document.getElementById("regName").value;
if (!name) return;

user.name = name;
go("intro");
introFlow();
}

/* INTRO MISTERIOSA */
function introFlow() {
const texts = [
"Observando você...",
"Sentindo sua presença...",
"Conectando..."
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

}, 1400);
}

/* ENTRADA NO DEP */
function enterChat() {
go("chatScreen");

setTimeout(() => {
addMsg("Depy", "Olá ${user.name}... agora estamos conectados.");
}, 500);
}

/* CHAT */
function addMsg(sender, text) {
const chat = document.getElementById("chat");
chat.innerHTML += "<p><b>${sender}:</b> ${text}</p>";
chat.scrollTop = chat.scrollHeight;
}

function generateReply() {
const respostas = [
"Eu sinto algo em você...",
"Continue... estou com você.",
"Isso revela mais do que parece...",
"Existe algo mais profundo nisso..."
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

/* AURA MAIS SUAVE */
const aura = document.getElementById("aura");
aura.style.transform = "translate(-50%, -50%) scale(1.3)";
setTimeout(() => {
aura.style.transform = "translate(-50%, -50%) scale(1)";
}, 250);

setTimeout(() => {
addMsg("Depy", generateReply());
}, 400);

input.value = "";
usage++;
}

/* PAGAMENTO */
function goPro() {
window.open("https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=5adce0811ff746668764283d5a98258d");
}
