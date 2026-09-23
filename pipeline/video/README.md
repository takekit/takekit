# Edição de vídeos curtos

Entrada do agente: [editor-reels](../.agents/skills/editor-reels/SKILL.md).
Pipeline humano: **entender → storyboard → material → fala → composição → revisão/entrega**.

| Arquivo | Responsabilidade |
|---|---|
| [estilo-creator.md](estilo-creator.md) | Preferências do perfil ativo, referências e lacunas para entrevista |
| [resolve/WORKFLOW.md](resolve/WORKFLOW.md) | Processo e critérios de conclusão |
| [resolve/DEFAULT.md](resolve/DEFAULT.md) | Estilo default (09-jev): palco, caption, faixa, SFX, pipeline |
| [resolve/FORMATOS.md](resolve/FORMATOS.md) | YAP e outros formatos; explicação ilustrada = palco A/B/C (default 19/09) |
| `projects/<slug>/briefing.md` | Conteúdo, objetivo, materiais e restrições; [modelo](resolve/references/briefing-template.md) |
| `projects/<slug>/edit/plan.json` | Estado/storyboard da edição; [modelo](resolve/references/plan-template.json) |
| [resolve/](resolve/README.md) | Galeria, motores e documentação técnica sob demanda |

Fontes originais são imutáveis. Derivados em `edit/`, previews em `preview/` ou `exports/`.
Briefings, planos e referências textuais podem ser versionados; mídia pesada permanece local.
O banco do Resolve contém timelines/comps atuais: plano/manifesto não substitui sua inspeção.
Manter estado existente de projetos antigos sem quebrar scripts consumidores. Não exigir um
novo HANDOVER.md ou review.md além do plano.
