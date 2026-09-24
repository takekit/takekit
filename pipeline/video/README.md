# Edição de vídeos curtos

Entrada do agente: [editor-reels](../.agents/skills/editor-reels/SKILL.md).
Pipeline humano: **entender → storyboard → material → fala → composição → revisão/entrega**.

| Arquivo | Responsabilidade |
|---|---|
| [estilo-creator.md](estilo-creator.md) | Preferências do perfil ativo, referências e lacunas para entrevista |
| [kit/WORKFLOW.md](kit/WORKFLOW.md) | Processo e critérios de conclusão |
| [styles/talking-head-motions/](../../styles/talking-head-motions/) | Estilo default (Talking Head + Motions, pacote Style Kit): palco, caption, faixa, SFX, pipeline |
| [kit/FORMATOS.md](kit/FORMATOS.md) | YAP e outros formatos; explicação ilustrada = palco A/B/C (default 19/09) |
| `projects/<slug>/briefing.md` | Conteúdo, objetivo, materiais e restrições; [modelo](kit/references/briefing-template.md) |
| `projects/<slug>/edit/plan.json` | Estado/storyboard da edição; [modelo](kit/references/plan-template.json) |
| [headless/](headless/README.md) | Trim, máscara (RVM), preview/export e captura; N jobs em paralelo |
| [kit/](kit/README.md) | Galeria, motores, estilos, assets e documentação técnica sob demanda |

Fontes originais são imutáveis. Derivados em `edit/`, previews em `preview/` ou `exports/`.
Briefings, planos e referências textuais podem ser versionados; mídia pesada permanece local.
O estado atual da montagem é o do projeto (`edit/cuts.json`, `edit/aroll.json`, `edit/compose*.json`,
`exports/`).
Manter estado existente de projetos antigos sem quebrar scripts consumidores. Não exigir um
novo HANDOVER.md ou review.md além do plano.
