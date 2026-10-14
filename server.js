
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const servidor = http.createServer(app);
const io = new Server(servidor);

app.use(express.static(path.join(__dirname, "public")));

const salas = new Map();
let proximoIdQuestao = 1;

function gerarCodigoSala() {
    const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let codigo;

    do {
        codigo = "";

        for (let i = 0; i < 5; i++) {
            codigo += caracteres[
                Math.floor(Math.random() * caracteres.length)
            ];
        }
    } while (salas.has(codigo));

    return codigo;
}

function gerarQuestao() {
    const a = Math.floor(Math.random() * 12) + 1;
    const b = Math.floor(Math.random() * 12) + 1;

    return {
        id: proximoIdQuestao++,
        texto: `${a} × ${b}`,
        resposta: a * b
    };
}

function atualizarSala(codigo) {
    const sala = salas.get(codigo);

    if (!sala) return;

    io.to(codigo).emit("estadoSala", {
        codigo,
        jogadores: sala.jogadores.map(jogador => ({
            id: jogador.id,
            nome: jogador.nome,
            pontos: jogador.pontos
        })),
        status: sala.status
    });
}

function enviarQuestao(jogador) {
    io.to(jogador.id).emit("questaoAtualizada", {
        questao: jogador.questao.texto,
        questionId: jogador.questao.id
    });
}

function encerrarPartida(codigo) {
    const sala = salas.get(codigo);

    if (!sala || sala.status !== "jogando") return;

    if (sala.intervalo) {
        clearInterval(sala.intervalo);
        sala.intervalo = null;
    }

    sala.status = "encerrada";

    const resultado = [...sala.jogadores]
        .sort((a, b) => b.pontos - a.pontos)
        .map(jogador => ({
            nome: jogador.nome,
            pontos: jogador.pontos
        }));

    io.to(codigo).emit("fimPartida", resultado);
    atualizarSala(codigo);
}

io.on("connection", socket => {
    console.log("Conectado:", socket.id);

    socket.on("criarSala", nomeRecebido => {
        const nome = String(nomeRecebido || "Jogador")
            .trim()
            .slice(0, 20) || "Jogador";

        const codigo = gerarCodigoSala();

        salas.set(codigo, {
            criadorId: socket.id,
            jogadores: [{
                id: socket.id,
                nome,
                pontos: 0,
                questao: null
            }],
            status: "aguardando",
            tempoRestante: 120,
            intervalo: null
        });

        socket.join(codigo);
        socket.emit("salaCriada", { codigo });
        atualizarSala(codigo);
    });

    socket.on("entrarSala", dados => {
        const codigo = String(dados?.codigo || "")
            .trim()
            .toUpperCase();

        const nome = String(dados?.nome || "Jogador")
            .trim()
            .slice(0, 20) || "Jogador";

        const sala = salas.get(codigo);

        if (!sala) {
            socket.emit("erroJogo", "Sala não encontrada.");
            return;
        }

        if (sala.status !== "aguardando") {
            socket.emit("erroJogo", "Essa partida já começou.");
            return;
        }

        if (sala.jogadores.length >= 2) {
            socket.emit("erroJogo", "A sala já está cheia.");
            return;
        }

        sala.jogadores.push({
            id: socket.id,
            nome,
            pontos: 0,
            questao: null
        });

        socket.join(codigo);
        socket.emit("entrouSala", { codigo });
        atualizarSala(codigo);
    });

    socket.on("iniciarPartida", codigoRecebido => {
        const codigo = String(codigoRecebido || "")
            .trim()
            .toUpperCase();

        const sala = salas.get(codigo);

        if (!sala || sala.status !== "aguardando") return;

        if (sala.criadorId !== socket.id) {
            socket.emit(
                "erroJogo",
                "Somente quem criou a sala pode iniciar."
            );
            return;
        }

        if (sala.jogadores.length !== 2) {
            socket.emit(
                "erroJogo",
                "São necessários dois jogadores."
            );
            return;
        }

        sala.status = "jogando";
        sala.tempoRestante = 120;

        // Cada jogador começa com sua própria questão e pontuação.
        for (const jogador of sala.jogadores) {
            jogador.pontos = 0;
            jogador.questao = gerarQuestao();
        }

        io.to(codigo).emit("partidaIniciada", {
            tempoRestante: sala.tempoRestante
        });

        for (const jogador of sala.jogadores) {
            enviarQuestao(jogador);
        }

        atualizarSala(codigo);

        sala.intervalo = setInterval(() => {
            sala.tempoRestante--;

            io.to(codigo).emit(
                "tempoAtualizado",
                sala.tempoRestante
            );

            if (sala.tempoRestante <= 0) {
                encerrarPartida(codigo);
            }
        }, 1000);
    });
    socket.on("solicitarRevanche", codigoRecebido => {
    const codigo = String(codigoRecebido || "")
        .trim()
        .toUpperCase();

    const sala = salas.get(codigo);

    if (!sala) {
        socket.emit("erroJogo", "Sala não encontrada.");
        return;
    }

    if (sala.status !== "encerrada") {
        socket.emit(
            "erroJogo",
            "A revanche só pode ser iniciada após o fim da partida."
        );
        return;
    }

    const jogadorNaSala = sala.jogadores.some(
        jogador => jogador.id === socket.id
    );

    if (!jogadorNaSala) {
        socket.emit("erroJogo", "Você não pertence a esta sala.");
        return;
    }

    if (sala.jogadores.length !== 2) {
        socket.emit(
            "erroJogo",
            "São necessários dois jogadores para a revanche."
        );
        return;
    }

    sala.status = "jogando";
    sala.tempoRestante = 120;

    // Zera a pontuação e gera uma nova questão para cada jogador.
    for (const jogador of sala.jogadores) {
        jogador.pontos = 0;
        jogador.questao = gerarQuestao();
    }

    io.to(codigo).emit("partidaIniciada", {
        tempoRestante: sala.tempoRestante
    });

    for (const jogador of sala.jogadores) {
        enviarQuestao(jogador);
    }

    atualizarSala(codigo);

    sala.intervalo = setInterval(() => {
        sala.tempoRestante--;

        io.to(codigo).emit(
            "tempoAtualizado",
            sala.tempoRestante
        );

        if (sala.tempoRestante <= 0) {
            encerrarPartida(codigo);
        }
    }, 1000);
});

    socket.on("responderQuestao", dados => {
        const codigo = String(dados?.codigo || "")
            .trim()
            .toUpperCase();

        const sala = salas.get(codigo);

        if (!sala || sala.status !== "jogando") return;

        const jogador = sala.jogadores.find(
            item => item.id === socket.id
        );

        if (!jogador || !jogador.questao) return;

        // Ignora respostas antigas ou repetidas.
        if (dados?.questionId !== jogador.questao.id) return;

        const resposta = Number(dados?.resposta);

        if (!Number.isFinite(resposta)) return;

        if (resposta === jogador.questao.resposta) {
            jogador.pontos++;

            // Só o jogador que acertou recebe uma nova questão.
            jogador.questao = gerarQuestao();
            enviarQuestao(jogador);

            // Atualiza a pontuação visível para os dois jogadores.
            atualizarSala(codigo);
        } else {
            socket.emit("respostaErrada");
        }
    });

    socket.on("disconnect", () => {
        for (const [codigo, sala] of salas) {
            const estavaNaSala = sala.jogadores.some(
                jogador => jogador.id === socket.id
            );

            if (!estavaNaSala) continue;

            if (sala.intervalo) {
                clearInterval(sala.intervalo);
                sala.intervalo = null;
            }

            io.to(codigo).emit(
                "jogadorSaiu",
                "Um jogador desconectou. A sala foi encerrada."
            );

            salas.delete(codigo);
            break;
        }

        console.log("Desconectado:", socket.id);
    });
});

const PORTA = 3000;

servidor.listen(PORTA, "0.0.0.0", () => {
    console.log(`Math Battle rodando na porta ${PORTA}`);
});
