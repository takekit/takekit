# Atalhos de objeto (opcional)

O 09-jev usou estes *objetos*. Não são cenas obrigatórias. O próximo vídeo
escreve o beat com as skills, dentro da faixa de [README.md](README.md).

Use um atalho em `src/patterns.tsx` só se o objeto da cláusula **for** este.

| pattern | objeto | inputs |
|---|---|---|
| `chips-decision` | lista com % e um vencedor | `rows[{label,pct,winner}]` |
| `binary-bar` | SIM / NÃO + barra | `yes, no, pct` |
| `logo-shine` | marca com shine | `brand` |
| `chips-list` | fila sem vencedor | `items[]` |
| `winner-pct` | um número % herói | `label, pct` |
| `card-list` | card com itens + tag | `items[], taggedIndex, tag` |
| `card-stamp` | card com recusa | `title, claim, stamp` |
| `chips-choice` | N marcas, uma escolhida | `options[], chosen` |
| `hero-range` | A–B + unidade | `from, to, unit, accent?` |
| `timer` | contador vivo | `from, to` |

Safe zone continua valendo: B apertado, C expansivo, caption intocável.
