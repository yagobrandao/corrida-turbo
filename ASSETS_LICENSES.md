# Licenças de assets

Este arquivo documenta todo asset visual de terceiros usado no projeto,
conforme exigido pelas licenças de atribuição.

## Ícones de interface — game-icons.net (CC BY 3.0)

Os ícones abaixo vêm de [game-icons.net](https://game-icons.net) e são
licenciados sob [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
Foram adaptados: o fundo quadrado original foi removido e a cor de
preenchimento trocada por `currentColor`, para colorir via CSS.
Todos estão embutidos como SVG inline em `src/ui/icons.js`.

| Ícone | Autor | Uso no projeto | Página original |
| --- | --- | --- | --- |
| Two coins | Delapouite | moedas (HUD, lojas, recompensas) | https://game-icons.net/1x1/delapouite/two-coins.html |
| Cog | Lorc | ajustes | https://game-icons.net/1x1/lorc/cog.html |
| Trophy | Lorc | desafios / navegação | https://game-icons.net/1x1/lorc/trophy.html |
| Round star | Delapouite | XP / destaque "você" | https://game-icons.net/1x1/delapouite/round-star.html |
| House | Delapouite | navegação HUB | https://game-icons.net/1x1/delapouite/house.html |
| Gamepad | Delapouite | navegação JOGOS / títulos | https://game-icons.net/1x1/delapouite/gamepad.html |
| Character | Delapouite | navegação VOCÊ | https://game-icons.net/1x1/delapouite/character.html |
| Wrench | sbed | oficina de melhorias | https://game-icons.net/1x1/sbed/wrench.html |
| Auto repair | Lorc | (reserva, oficina) | https://game-icons.net/1x1/lorc/auto-repair.html |
| Padlock | Lorc | sala privada | https://game-icons.net/1x1/lorc/padlock.html |
| Earth (Africa/Europe) | Delapouite | sala pública / partidas abertas | https://game-icons.net/1x1/delapouite/earth-africa-europe.html |
| Key | Lorc | entrar com código | https://game-icons.net/1x1/lorc/key.html |
| Photo camera | Delapouite | escanear QR Code | https://game-icons.net/1x1/delapouite/photo-camera.html |
| Crown | Lorc | host da sala | https://game-icons.net/1x1/lorc/crown.html |
| Check mark | Delapouite | pronto / concluído | https://game-icons.net/1x1/delapouite/check-mark.html |
| Magnifying glass | Lorc | (reserva, Adivinhe) | https://game-icons.net/1x1/lorc/magnifying-glass.html |
| Flame | Carl Olsen | botão JOGAR / desafios diários | https://game-icons.net/1x1/carl-olsen/flame.html |
| Medal | Lorc | conquistas | https://game-icons.net/1x1/lorc/medal.html |
| Archery target | Lorc | progresso / dias jogados | https://game-icons.net/1x1/lorc/archery-target.html |
| Cycle | Lorc | atualizar lista de salas | https://game-icons.net/1x1/lorc/cycle.html |
| Sparkles | Delapouite | criar partida | https://game-icons.net/1x1/delapouite/sparkles.html |
| Star swirl | Lorc | (reserva) | https://game-icons.net/1x1/lorc/star-swirl.html |

Atribuição resumida (obrigatória pela CC BY 3.0):
ícones por **Lorc, Delapouite, sbed e Carl Olsen** — https://game-icons.net (CC BY 3.0).

## Fonte — Fredoka (SIL Open Font License 1.1)

- **Fredoka**, de Milena Brandão / Hafontia, servida via Google Fonts.
- Licença: [SIL OFL 1.1](https://openfontlicense.org/) — uso comercial permitido.
- https://fonts.google.com/specimen/Fredoka

## Ilustrações dos jogos e personagens — arte própria

As thumbnails dos jogos (mini-cenas dos cards), os personagens (SVG) e todas
as texturas dentro das partidas são **arte original do projeto**, gerada por
código em `src/ui/art.js` e `src/games/*/textures.js`. Nenhum asset de jogo
comercial foi copiado. A opção por arte própria (em vez de packs externos,
como os da Kenney) foi deliberada: garante que todos os cinco jogos e a
plataforma compartilhem o mesmo traço visual.
