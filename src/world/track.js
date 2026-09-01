// Pista procedural determinística: a mesma seed gera exatamente os mesmos
// obstáculos e moedas nos dois celulares (só a seed viaja pela rede).
//
// Tipos de obstáculo:
//   'low'   - barreira baixa  -> PULE
//   'high'  - barreira alta   -> DESLIZE
//   'block' - caixote/veículo -> troque de faixa
//   'train' - trem longo      -> troque de faixa
//   'hole'  - buraco          -> PULE (ou desvie)
//
// Regras de segurança da geração:
//   - nunca bloquear as 3 faixas com obstáculos "sólidos" ao mesmo tempo;
//   - se o espaço até o próximo padrão for curto, a faixa livre nova fica a
//     no máximo 1 faixa de distância da faixa livre anterior;
//   - trens nunca se sobrepõem a outros padrões.
import { Rng } from '../core/rng.js';

export const OB_LEN = { low: 2, high: 2, block: 5, train: 30, hole: 6 };

export class Track {
  constructor(seed) {
    this.rng = new Rng(seed);
    this.obstacles = [];   // { id, d, lane, type, len }
    this.coins = [];       // { id, d, lane }
    this._cursor = 58;     // primeira ameaça já nos primeiros segundos
    this._prevFree = 1;    // faixa livre do último padrão
    this._nextId = 1;
  }

  // Garante que a pista existe até a distância pedida.
  ensure(dist) {
    while (this._cursor < dist + 400) this._genPattern();
  }

  // Obstáculos/moedas na janela [from, to) — para spawn de sprites.
  obstaclesBetween(from, to) {
    return this.obstacles.filter(o => o.d >= from && o.d < to);
  }
  coinsBetween(from, to) {
    return this.coins.filter(c => c.d >= from && c.d < to);
  }

  // Libera memória do que já ficou para trás.
  prune(dist) {
    this.obstacles = this.obstacles.filter(o => o.d + o.len > dist - 60);
    this.coins = this.coins.filter(c => c.d > dist - 60);
  }

  _add(d, lane, type) {
    this.obstacles.push({ id: this._nextId++, d, lane, type, len: OB_LEN[type] });
  }
  _addCoinRun(d, lane, count, spacing = 4.5) {
    for (let i = 0; i < count; i++) {
      this.coins.push({ id: this._nextId++, d: d + i * spacing, lane });
    }
  }

  _tier() {
    const d = this._cursor;
    if (d < 300) return 0;   // fácil
    if (d < 800) return 1;   // médio
    if (d < 1600) return 2;  // difícil
    return 3;                // muito difícil
  }

  _gap() {
    const t = this._tier();
    const r = this.rng;
    // valores em metros: com a velocidade maior, o espaçamento cresce junto
    // para o tempo de reação continuar justo
    if (t === 0) return r.range(42, 57);
    if (t === 1) return r.range(34, 48);
    if (t === 2) return r.range(27, 40);
    return r.range(22, 35);
  }

  // Sorteia a faixa livre respeitando a distância até o padrão anterior.
  _pickFree(gap) {
    const r = this.rng;
    if (gap >= 20) return r.int(0, 2);
    // gap curto: fica na mesma faixa livre ou em uma vizinha
    const options = [this._prevFree];
    if (this._prevFree > 0) options.push(this._prevFree - 1);
    if (this._prevFree < 2) options.push(this._prevFree + 1);
    return r.pick(options);
  }

  _genPattern() {
    const r = this.rng;
    const t = this._tier();
    const gap = this._gap();
    const d = this._cursor + gap;
    const free = this._pickFree(gap);
    const others = [0, 1, 2].filter(l => l !== free);

    // pesos por dificuldade
    const patterns = ['single', 'single', 'coins'];
    if (t >= 1) patterns.push('double', 'train', 'single');
    if (t >= 2) patterns.push('jumpWall', 'double', 'hole');
    if (t >= 3) patterns.push('double', 'train', 'jumpWall');

    const p = r.pick(patterns);
    let endLen = 2;

    switch (p) {
      case 'single': {
        // um obstáculo em uma faixa que NÃO é a livre
        const lane = r.pick(others);
        const type = r.pick(t === 0 ? ['low', 'block', 'high'] : ['low', 'block', 'high', 'hole']);
        this._add(d, lane, type);
        endLen = OB_LEN[type];
        // moedas premiam a faixa livre
        if (r.chance(0.5)) this._addCoinRun(d - 4, free, r.int(3, 5));
        break;
      }
      case 'double': {
        // duas faixas ocupadas, uma passável por pulo/slide às vezes
        const [a, b] = others;
        const typeA = r.pick(['block', 'low', 'high']);
        const typeB = r.pick(['block', 'low', 'high']);
        this._add(d, a, typeA);
        this._add(d, b, typeB);
        endLen = Math.max(OB_LEN[typeA], OB_LEN[typeB]);
        if (r.chance(0.6)) this._addCoinRun(d - 4, free, r.int(3, 6));
        break;
      }
      case 'jumpWall': {
        // barreira baixa nas 3 faixas: sempre passável pulando
        this._add(d, 0, 'low');
        this._add(d, 1, 'low');
        this._add(d, 2, 'low');
        endLen = 2;
        // moedas no ar sobre a barreira
        if (r.chance(0.5)) this._addCoinRun(d - 2, r.int(0, 2), 2, 2.5);
        // não muda a faixa livre de referência
        this._cursor = d + endLen;
        return;
      }
      case 'train': {
        const lane = r.pick(others);
        this._add(d, lane, 'train');
        endLen = OB_LEN.train;
        // moedas correm ao lado do trem
        this._addCoinRun(d + 3, free, r.int(4, 7));
        break;
      }
      case 'hole': {
        const lane = r.pick(others);
        this._add(d, lane, 'hole');
        if (t >= 3 && r.chance(0.4)) {
          const lane2 = others.find(l => l !== lane);
          if (lane2 !== undefined) this._add(d, lane2, 'hole');
        }
        endLen = OB_LEN.hole;
        break;
      }
      case 'coins': {
        const lane = r.int(0, 2);
        this._addCoinRun(d, lane, r.int(5, 8));
        endLen = 8;
        // padrão só de moedas não restringe faixa
        this._cursor = d + endLen;
        return;
      }
    }

    this._prevFree = free;
    this._cursor = d + endLen;
  }
}
