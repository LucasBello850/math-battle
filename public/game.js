
const socket = io();

const nomeJogador = document.getElementById("nomeJogador");
const codigoSala = document.getElementById("codigoSala");
const painelSala = document.getElementById("painelSala");
const painelPartida = document.getElementById("painelPartida");

const botaoCriar = document.getElementById("botaoCriar");
const botaoEntrar = document.getElementById("botaoEntrar");
const botaoIniciar = document.getElementById("botaoIniciar");
const botaoResponder = document.getElementById("botaoResponder");
const botaoRevanche = document.getElementById("botaoRevanche");

const codigoExibido = document.getElementById("codigoExibido");
const listaJogadores = document.getElementById("listaJogadores");
const elementoQuestao = document.getElementById("questao");
const elementoTempo = document.getElementById("tempo");
const elementoPontos = document.getElementById("pontos");
const elementoMensagem = document.getElementById("mensagem");

const campoResposta = document.getElementById("resposta");
const formulario = document.getElementById("formulario");

let minhaSala = "";
let meuId = "";
let jogando = false;
let minhaQuestaoId = null;

socket.on("connect", () => {
    meuId = socket.id;
    elementoMensagem.textContent = "Conectado ao servidor!";
});

socket.on("connect_error", () => {
    elementoMensagem.textContent =
        "Não foi possível conectar ao servidor.";
});

function obterNome() {
    return nomeJogador.value.trim() || "Jogador";
}

botaoCriar.addEventListener("click", () => {
    socket.emit("criarSala", obterNome());
});

botaoEntrar.addEventListener("click", () => {
    const codigo = codigoSala.value.trim().toUpperCase();

    if (!codigo) {
        elementoMensagem.textContent =
            "Digite o código da sala.";
        return;
    }

    socket.emit("entrarSala", {
        codigo,
        nome: obterNome()
    });
});

socket.on("salaCriada", dados => {
    minhaSala = dados.codigo;
    mostrarPainelSala();
    elementoMensagem.textContent =
        "Sala criada! Aguarde outro jogador.";
});

socket.on("entrouSala", dados => {
    minhaSala = dados.codigo;
    mostrarPainelSala();
    elementoMensagem.textContent =
        "Você entrou na sala! Aguarde o início.";
});

function mostrarPainelSala() {
    painelSala.hidden = true;
    painelPartida.hidden = false;
    codigoExibido.textContent = minhaSala;
}

socket.on("estadoSala", sala => {
    listaJogadores.replaceChildren();

    sala.jogadores.forEach(jogador => {
        const item = document.createElement("li");
        const souEu = jogador.id === meuId;

        item.textContent =
            `${jogador.nome}${souEu ? " (Você)" : ""} — ` +
            `${jogador.pontos} pontos`;

        listaJogadores.appendChild(item);

        if (souEu) {
            elementoPontos.textContent = jogador.pontos;
        }
    });

    // Somente o criador da sala pode iniciar.
    botaoIniciar.disabled =
        sala.status !== "aguardando" ||
        sala.jogadores.length !== 2 ||
        sala.jogadores[0]?.id !== meuId;

    if (sala.status === "aguardando") {
        elementoMensagem.textContent =
            sala.jogadores.length < 2
                ? "Aguardando o segundo jogador..."
                : "Dois jogadores conectados! Prontos para jogar?";
    }
});

botaoIniciar.addEventListener("click", () => {
    if (minhaSala) {
        socket.emit("iniciarPartida", minhaSala);
    }
});

socket.on("partidaIniciada", dados => {
    jogando = true;
    botaoRevanche.hidden = true;
    botaoRevanche.disabled = false;

    elementoTempo.textContent = "02:00";
    elementoMensagem.textContent = "Valendo! Boa sorte!";

    campoResposta.disabled = false;
    botaoResponder.disabled = false;
    botaoIniciar.disabled = true;

    campoResposta.value = "";
    campoResposta.focus();
});

socket.on("questaoAtualizada", dados => {
    elementoQuestao.textContent = dados.questao;
    minhaQuestaoId = dados.questionId;

    campoResposta.value = "";

    if (jogando) {
        elementoMensagem.textContent = "Resolva sua questão!";
        campoResposta.focus();
    }
});

socket.on("tempoAtualizado", segundos => {
    const minutos = Math.floor(segundos / 60);
    const resto = segundos % 60;

    elementoTempo.textContent =
        `${String(minutos).padStart(2, "0")}:` +
        `${String(resto).padStart(2, "0")}`;
});

formulario.addEventListener("submit", evento => {
    evento.preventDefault();

    if (!jogando || !minhaSala) return;
    if (campoResposta.value.trim() === "") return;

    socket.emit("responderQuestao", {
    codigo: minhaSala,
    resposta: Number(campoResposta.value),
    questionId: minhaQuestaoId
});

    campoResposta.value = "";
    campoResposta.focus();
});

socket.on("respostaErrada", () => {
    elementoMensagem.textContent = "Resposta incorreta. Tente a próxima!";
});

socket.on("fimPartida", resultado => {
    jogando = false;
    campoResposta.disabled = true;
    botaoResponder.disabled = true;
    botaoRevanche.hidden = false;

    const primeiro = resultado[0];
    const segundo = resultado[1];

    if (!primeiro) {
        elementoMensagem.textContent = "Partida encerrada.";
        return;
    }

    if (!segundo || primeiro.pontos === segundo.pontos) {
        elementoMensagem.textContent =
            `Empate! ${primeiro.pontos} pontos.`;
    } else {
        elementoMensagem.textContent =
            `Vitória de ${primeiro.nome}, com ${primeiro.pontos} pontos!`;
    }
});

botaoRevanche.addEventListener("click", () => {
    if (!minhaSala) return;

    socket.emit("solicitarRevanche", minhaSala);

    botaoRevanche.disabled = true;
    elementoMensagem.textContent =
        "Solicitação de revanche enviada...";
});



socket.on("erroJogo", mensagem => {
    elementoMensagem.textContent = mensagem;
});

socket.on("jogadorSaiu", mensagem => {
    jogando = false;
    campoResposta.disabled = true;
    botaoResponder.disabled = true;
    botaoIniciar.disabled = true;
    elementoMensagem.textContent = mensagem;
});
