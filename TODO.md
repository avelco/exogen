# Backlog

## Dado de remate exacto (suministros)

**Status:** pending  
**Area:** combat / rewards

### Idea
Cuando el golpe del jugador elimine la vida del enemigo de forma **exacta** (daño final == HP restante, sin overflow), en lugar de un KO normal:

1. Aparece un **nuevo dado** para que el jugador lo lance.
2. Según el valor (1–6), se reproduce un **finish distinto** (animación / texto / SFX).
3. Se otorgan **suministros** según ese valor (tabla a definir).

### Notas de diseño
- Solo aplica si `finalDamage === enemy.hp` **antes** de restar (o `finalDamage === hp` al resolver).
- Si el daño supera la vida restante → KO normal, sin finish die.
- Integrar en el flujo post-hit de [`CombatScene`](src/scenes/CombatScene.ts) / [`CombatEngine.resolve`](src/domain/combat/CombatEngine.ts), antes de `onEnemyKilled` / shop.
- Definir tabla de suministros y nombres de remate por cara (1–6).
- Considerar bosses / oleas: ¿solo el último enemigo de la wave, o cualquiera?

### Acceptance (borrador)
- [ ] Exact kill dispara el dado de finish
- [ ] Overkill no dispara finish
- [ ] Cada cara 1–6 tiene feedback distinto + suministros
- [ ] Tras el finish, continúa el flujo actual (siguiente enemigo / shop / reward)
