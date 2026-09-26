Leia CLAUDE.md (as regras do projeto valem para qualquer agente).
Leia .memory/builder.md e .memory/audit-checklist.md desta pasta antes de qualquer coisa.
O pedido em vigor está em .memory/builder-brief.md; portas PORT=5341 e E2E_PORT=5311; commits só no branch codex.
Coordenação com o Claude: C:\Users\jonathanrodriguesti\Documents\builder-coord\BOARD.md (ler antes de cada item e antes de abrir o Chrome).
Entrega atual: divida 7.1 em partes a-e conforme .memory/builder-brief.md; cada parte fecha com teste leve, dente, uso real no navegador embutido em Desktop 100% e Phone Ajustar, evidência, commit e push. As quatro combinações e a suíte pesada ficam para o fim do item/bloco.
Navegador: usar o browser embutido para uso real; CLAUDE e CODEX podem testar ao mesmo tempo. Marque uma sessão leve com C:\Users\jonathanrodriguesti\Documents\builder-coord\browser-codex.lock; E2E_WORKERS=2 e E2E_PORT=5311. suite.lock é só para uso pesado exclusivo, conforme BOARD seção 4.
Ritmo em vigor: nenhum npm run check amplo entre partes; merge de origin/integration só no começo de cada ITEM (7.2, 7.3...), não entre partes de 7.1. Reserve arquivo só durante a edição e libere no commit. Não espere o outro agente para trabalho leve.
