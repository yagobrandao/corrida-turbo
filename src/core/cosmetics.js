// Cosméticos do personagem: chapéus e rostos.
//
// São desenhados por cima da skin, tanto no SVG das telas (ui/art.js) quanto
// na textura de canvas usada DENTRO das partidas (games/runner/textures.js).
// Por isso cada item é só um id + custo — a forma vive nos dois desenhistas,
// que compartilham as mesmas coordenadas do boneco (76×104).
export const HATS = [
  { id: 'none',    name: 'Nenhum',   cost: 0 },
  { id: 'cap',     name: 'Boné',     cost: 120 },
  { id: 'party',   name: 'Festa',    cost: 220 },
  { id: 'top',     name: 'Cartola',  cost: 380 },
  { id: 'horns',   name: 'Chifres',  cost: 520 },
  { id: 'halo',    name: 'Auréola',  cost: 700 },
  { id: 'crown',   name: 'Coroa',    cost: 1000 },
];

export const FACES = [
  { id: 'none',    name: 'Normal',   cost: 0 },
  { id: 'happy',   name: 'Feliz',    cost: 100 },
  { id: 'cool',    name: 'Descolado', cost: 260 },
  { id: 'angry',   name: 'Bravo',    cost: 340 },
  { id: 'wink',    name: 'Piscada',  cost: 420 },
  { id: 'star',    name: 'Estrelado', cost: 640 },
];

export const getHat = (id) => HATS.find(h => h.id === id) || HATS[0];
export const getFace = (id) => FACES.find(f => f.id === id) || FACES[0];

// Um item vale se foi comprado (ou é grátis).
export function ownsCosmetic(item, owned) {
  return item.cost === 0 || (owned || []).includes(item.id);
}

// Normaliza o que veio do save: nunca devolve algo que o jogador não tem.
export function resolveCosmetics(progress) {
  const owned = progress.owned || [];
  const hat = getHat(progress.hat);
  const face = getFace(progress.face);
  return {
    hat: ownsCosmetic(hat, owned) ? hat.id : 'none',
    face: ownsCosmetic(face, owned) ? face.id : 'none',
  };
}

// Chave curta para compor ids de textura e mensagens de rede.
export const cosKey = (cos) => `${cos?.hat || 'none'}-${cos?.face || 'none'}`;
