// Registro de jogos da plataforma.
//
// A Central de Jogos conhece APENAS este arquivo. Ela lê os manifestos para
// montar a vitrine e o formulário de criar sala, e chama `load()` só quando a
// partida vai realmente começar — o código do jogo entra por import dinâmico,
// então quem só abre o lobby não baixa os três jogos.
//
// Para adicionar um jogo novo, basta acrescentar um manifesto aqui. Nenhum
// arquivo de menu, sala ou rede precisa ser tocado.
//
// Contrato que o módulo carregado deve exportar:
//   createGame(ctx) -> { destroy() }
// onde ctx = {
//   phaser,            // Phaser.Game já iniciado (ou null p/ jogos de DOM)
//   bus,               // canal de rede do jogo (net/bus.js)
//   players,           // [{ slot, name, skin }] participantes
//   mySlot, isHost,
//   seed,              // sorteada pelo host, igual para todos
//   settings,          // opções escolhidas na sala
//   ui,                // helpers de HUD/overlay (ui/gameui.js)
//   onFinish(rows),    // encerra a partida; rows = [{slot, score, detail}]
// }

export const CATEGORIES = [
  { id: 'todos',  name: 'Todos' },
  { id: 'arcade', name: 'Arcade' },
  { id: 'party',  name: 'Party' },
  { id: 'estrategia', name: 'Estratégia' },
  { id: 'puzzle', name: 'Puzzle' },
];

// As opções ficam no manifesto (e não dentro do jogo) porque a tela de criar
// sala precisa mostrá-las antes de o módulo do jogo ser baixado.
export const GAMES = [
  {
    id: 'runner',
    name: 'Corrida Turbo',
    emoji: '🏃',
    tagline: 'Desvie, pule e chegue mais longe',
    description: 'Corrida infinita em três faixas. Deslize para os lados para trocar de faixa, para cima para pular e para baixo para deslizar. Quem for mais longe vence.',
    category: 'arcade',
    minPlayers: 1,
    maxPlayers: 4,
    accent: '#39a9f4',
    settings: [{
      id: 'difficulty',
      label: 'Dificuldade',
      default: 'normal',
      choices: [
        { id: 'facil',   label: 'Fácil',   emoji: '🌱', desc: 'Para aprender os gestos' },
        { id: 'normal',  label: 'Normal',  emoji: '⚡', desc: 'A corrida padrão' },
        { id: 'dificil', label: 'Difícil', emoji: '🔥', desc: 'Reflexo afiado' },
        { id: 'insano',  label: 'Insano',  emoji: '💀', desc: 'Quase impossível' },
      ],
    }],
    load: () => import('./runner/RunnerGame.js'),
  },
  {
    id: 'flappy',
    name: 'Flappy Duo',
    emoji: '🐦',
    tagline: 'Toque para voar e não bata',
    description: 'Toque na tela para bater as asas e atravesse o máximo de canos que conseguir. Todos enfrentam exatamente a mesma sequência de obstáculos.',
    category: 'arcade',
    minPlayers: 1,
    maxPlayers: 4,
    accent: '#2fb573',
    settings: [{
      id: 'difficulty',
      label: 'Dificuldade',
      default: 'normal',
      choices: [
        { id: 'facil',   label: 'Fácil',   emoji: '🌱', desc: 'Vãos largos' },
        { id: 'normal',  label: 'Normal',  emoji: '⚡', desc: 'O voo padrão' },
        { id: 'dificil', label: 'Difícil', emoji: '🔥', desc: 'Vãos apertados' },
      ],
    }],
    load: () => import('./flappy/FlappyGame.js'),
  },
  {
    id: 'bomb',
    name: 'Bomb Arena',
    emoji: '💣',
    tagline: 'Elimine seus amigos antes que eles eliminem você',
    description: 'Arena vista de cima: plante bombas, exploda caixotes, pegue melhorias e seja o último de pé. Joystick na esquerda, bomba na direita. Se a rodada demorar, a arena fecha em lava.',
    category: 'arcade',
    minPlayers: 1,     // treino solo; com amigos é 2-4
    maxPlayers: 4,
    accent: '#e8483f',
    settings: [{
      id: 'rounds',
      label: 'Rodadas',
      default: '3',
      choices: [
        { id: '1', label: '1', emoji: '⚡', desc: 'Mata-mata único' },
        { id: '3', label: '3', emoji: '🎯', desc: 'Melhor de três' },
        { id: '5', label: '5', emoji: '🏆', desc: 'Série longa' },
      ],
    }],
    load: () => import('./bomb/BombGame.js'),
  },
  {
    id: 'tag',
    name: 'Pega-Pega',
    emoji: '👹',
    tagline: 'Corra. Se esconda. Não deixe te pegarem',
    description: 'Arena vista de cima: um jogador pega, os outros fogem. Encostou, trocou — quem for pego vira o pegador. Pontos por fugir, capturar e sobreviver até o fim. Sozinho, treine contra o Robô.',
    category: 'arcade',
    minPlayers: 1,     // treino solo contra o Robô; com amigos é 2-4
    maxPlayers: 4,
    accent: '#d45de0',
    settings: [{
      id: 'rounds',
      label: 'Rodadas',
      default: '3',
      choices: [
        { id: '1', label: '1', emoji: '⚡', desc: 'Rodada única' },
        { id: '3', label: '3', emoji: '🎯', desc: 'Melhor de três' },
        { id: '5', label: '5', emoji: '🏆', desc: 'Série longa' },
      ],
    }],
    load: () => import('./tag/TagGame.js'),
  },
  {
    id: 'td',
    name: 'Torre & Cerco',
    emoji: '🏰',
    tagline: 'Defenda a base contra as ondas',
    description: 'Tower defense de partidas rápidas: posicione arqueiros, magos, gelo e canhões ao longo do caminho e segure ondas cada vez maiores. Ganhe moedas permanentes e volte mais forte.',
    category: 'arcade',
    minPlayers: 1,
    maxPlayers: 1,
    soloOnly: true,     // não aparece em criar sala nem no diretório
    accent: '#d9a410',
    load: () => import('./td/TDGame.js'),
  },
  {
    id: 'island',
    name: 'Ilha do Zero',
    emoji: '🏝️',
    tagline: 'Colete, construa e evolua sua ilha',
    description: 'Sobrevivência relaxante: explore a ilha, corte árvores, minere pedras, construa fogueira, abrigo e bancada, melhore ferramentas e suba de nível. Seu progresso fica salvo — a ilha continua de onde você parou.',
    category: 'party',
    minPlayers: 1,
    maxPlayers: 1,
    soloOnly: true,
    accent: '#2fb573',
    load: () => import('./island/IslandGame.js'),
  },
  {
    id: 'battle',
    name: 'Battle Tactics',
    emoji: '⚔️',
    tagline: 'Monte o exército e veja a batalha',
    description: 'Auto battler: compre unidades na loja, junte três iguais para evoluir, combine facções, classes e duplas para ativar bônus e posicione seu exército. Depois é só assistir: eles lutam sozinhos. Sozinho, sobreviva 10 rodadas e derrote o Ancião de Pedra. Com amigos (2 a 5 na sala), todo confronto é 1 contra 1 — quem sobra sem par (sala de 3 ou 5) enfrenta um Ghost, uma cópia da formação mais recente de outro jogador, só para ninguém ficar de fora.',
    category: 'estrategia',
    minPlayers: 1,     // solo contra a IA; com 2-5 na sala vira PvP em duplas 1v1
    maxPlayers: 5,
    accent: '#c9302a',
    load: () => import('./autobattler/BattleGame.js'),
  },
  {
    id: 'triplequest',
    name: 'Triple Quest',
    emoji: '🧩',
    tagline: 'Junte 3 iguais e limpe o tabuleiro',
    description: 'Peças empilhadas em camadas: toque nas que estão livres para levá-las à bandeja, junte três iguais para sumirem e limpe tudo antes da bandeja encher. Mapa de fases, estrelas, combos, boosters, baús, vidas e desafio do dia.',
    category: 'puzzle',
    minPlayers: 1,
    maxPlayers: 1,
    soloOnly: true,
    accent: '#ff8fc4',
    load: () => import('./triplequest/TQGame.js'),
  },
  {
    id: 'match',
    name: 'Pomar Mágico',
    emoji: '🍓',
    tagline: 'Junte 3 frutas e faça cascatas',
    description: 'Match-3 de frutas mágicas: troque duas frutas vizinhas para juntar 3 iguais. Quatro viram um foguete, cinco viram a bomba de cor, em T ou L nasce a bomba — e combinar especiais explode o tabuleiro inteiro. Sozinho: mapa de fases com gelo, caixas e correntes, estrelas que constroem a Ilha do Pomar, recompensa diária, roda da sorte, missões, baús e coleção. Com amigos: modo Batalha — confrontos 1 contra 1 por rodada, vidas, ataques entre tabuleiros e Ghost pra ninguém ficar de fora.',
    category: 'puzzle',
    minPlayers: 1,     // sozinho joga a Aventura ou treina VS BOT; com 2+ a sala já entra direto na Batalha
    maxPlayers: 5,
    accent: '#ff8b3d',
    load: () => import('./match/M3Game.js'),
  },
  {
    id: 'guess',
    name: 'Adivinhe',
    emoji: '🔥',
    tagline: 'Quente ou frio até achar a palavra',
    description: 'Uma palavra secreta por rodada. Cada palpite mostra o quanto você chegou perto do significado dela. Quem descobrir primeiro pontua mais.',
    category: 'party',
    minPlayers: 1,     // dá para treinar sozinho; com amigos é 2-4
    maxPlayers: 4,
    accent: '#ff8b3d',
    settings: [{
      id: 'rounds',
      label: 'Rodadas',
      default: '3',
      choices: [
        { id: '3', label: '3', emoji: '🎯', desc: 'Partida rápida' },
        { id: '5', label: '5', emoji: '🎲', desc: 'Partida média' },
        { id: '7', label: '7', emoji: '🏆', desc: 'Partida longa' },
      ],
    }],
    load: () => import('./guess/GuessGame.js'),
  },
];

// Valores padrão de um jogo, para a sala já abrir configurada.
export function defaultSettings(game) {
  const out = {};
  for (const s of game.settings || []) out[s.id] = s.default;
  return out;
}

export function getGame(id) {
  return GAMES.find(g => g.id === id) || GAMES[0];
}

export function gamesByCategory(cat) {
  return !cat || cat === 'todos' ? GAMES : GAMES.filter(g => g.category === cat);
}
