# 🏃 Corrida Turbo

Endless runner multiplayer para 2 jogadores, direto no navegador do celular. Sem instalar nada.

Um jogador cria a sala, o outro entra pelo código ou apontando a câmera para o QR Code. A partir daí a partida roda direto entre os dois aparelhos por WebRTC.

## Como jogar

| Gesto | Ação |
| --- | --- |
| Deslizar ← → | trocar de faixa |
| Deslizar ↑ | pular |
| Deslizar ↓ | deslizar por baixo |

No desktop, as setas e WASD funcionam para testar.

Cada jogador tem 3 vidas. Quem for mais longe vence.

## Rodando localmente

```bash
npm install
npm run dev
```

O multiplayer **não funciona** abrindo o IP da rede local no celular: WebRTC exige contexto seguro (HTTPS ou `localhost`). Para jogar de verdade entre dois aparelhos, use a versão publicada.

## Publicando

O push na branch `main` dispara o workflow que compila e publica no GitHub Pages. Nas configurações do repositório, em **Settings → Pages**, a origem precisa estar como **GitHub Actions**.

## Arquitetura

```
src/
  core/      configuração e RNG determinístico (seed compartilhada)
  net/       WebRTC via PeerJS + protocolo de mensagens
  world/     geração procedural da pista
  game/      cena do Phaser, texturas e áudio
  ui/        telas e HUD em DOM
```

O host é autoritativo: sorteia a seed, dá a largada e decide o resultado. Cada aparelho simula o próprio jogador e desenha o rival interpolando os estados recebidos, a 12 Hz. O servidor de signaling só participa do aperto de mão inicial — depois disso a partida é ponto a ponto.

Stack: Phaser 3, PeerJS, Vite. Todas as texturas e sons são gerados em runtime, sem arquivos de asset.
