# Beltline

*Una catena di montaggio di agenti per Claude Code.*
[Read in English](README.md)

Progetti il lavoro con Claude finché è chiaro, dai il via, e poi una squadra di agenti lo costruisce senza che tu debba
starci dietro: prima i modelli economici, quelli più forti solo quando un controllo fallisce, macchine e revisori nuovi
che controllano ogni pezzo, muri (hook) che bloccano le mosse pericolose, e un registro che sopravvive ai limiti del
contesto. Ogni lavoro lascia lezioni per il successivo.

Come in un gioco di fabbriche, è fatta di macchine separate collegate da nastri. Ogni macchina è una skill, un agente o
un hook, e si può usare anche da sola.

```
 design ──► schematic ──► VIA ──► recruit ──► worker ──► verify ──► ledger ──► lessons
(parlare)   (piano)              (assumere) (costruire) (controllo) (magazzino) (imparare)
     ▲ council (scelte difficili)        simplifier         scout · reviewer · cacciatori
                  muri: guard-bash · guard-files · done-gate · cost-meter
```

## Installazione

```
/plugin marketplace add DioDiAltro/beltline
/plugin install beltline@beltline
```

Serve Node.js (che Claude Code richiede già). Funziona meglio con il plugin
[superpowers](https://github.com/obra/superpowers): design e schematic passano alle sue skill di brainstorming e di
piano quando c'è.

## Uso

Scrivi «usa beltline:capo per costruire …», o affida semplicemente un lavoro di codice grande. Per riprendere dopo una
pausa o un limite d'uso: «riprendi il lavoro». Di' «modalità dettagliata» se vuoi vedere ogni passo; di base è
silenziosa: un solo riepilogo alla fine.

Le skill e gli agenti sono scritti in inglese, ma Claude parla con te nella tua lingua.

## Le macchine

| Pezzo | Tipo | Cosa fa |
|---|---|---|
| `capo` | skill | Il direttore: porta il nastro dalla progettazione al riepilogo, decide invece di fermarsi |
| `design` | skill | Capisce il lavoro con te, una domanda alla volta, e scrive il documento di progetto |
| `council` | skill | Quattro voci discutono una scelta difficile, così non vince per forza la prima idea |
| `schematic` | skill | Trasforma il progetto in compiti con file precisi, controlli di fine e un contratto |
| `recruit` | skill | Sceglie agente, modello ed effort; scrive istruzioni e perimetro; sale di livello se fallisce |
| `verify` | skill | Macchine → esploratore → revisione con due verdetti; l'autore non si rivede mai da solo |
| `ledger` | skill | I file in `.capo/` che sopravvivono ai riassunti; ripresa; costi |
| `lessons` | skill | Trasforma errori, correzioni e costi in regole brevi |
| `worker` | agente | Costruisce un compito, prima il test, dentro il suo perimetro |
| `scout` | agente | Cerca senza modificare; usa il grafo del codice (graphify) se c'è |
| `reviewer` | agente | Revisione a contesto pulito: ha fatto ciò che era chiesto, è fatto bene |
| `silent-failure-hunter` | agente | Errori ingoiati e ripieghi che nascondono i guasti |
| `test-analyzer` | agente | I test coprono il comportamento o esistono e basta? |
| `simplifier` | agente | Ripulisce il codice già verde senza cambiarne il comportamento |
| `guard-bash` | hook | Blocca push, `--no-verify`, stash, reset --hard, merge, scritture sui file di controllo |
| `guard-files` | hook | Blocca le modifiche fuori dal perimetro dei compiti in corso (`.capo/scope.txt`) |
| `done-gate` | hook | Un worker non può dire DONE senza la riga di stato e un rapporto con controlli veri |
| `cost-meter` | hook | Segna i token per agente e modello in `.capo/costs.jsonl` |

I muri valgono solo per gli agenti del kit: tu e la tua sessione principale non venite mai bloccati. Solo la sessione
principale crea agenti e unisce i rami, perché in Claude Code un sottoagente non può crearne altri: una gerarchia di
«capireparto» non partirebbe, quindi i lavori grandi si dividono in zone fatte una dopo l'altra.

## Modelli

Il più economico che basta: `haiku` per i compiti meccanici con l'elenco completo, `sonnet` per le funzioni, `opus` per
il codice delicato; si sale `haiku → sonnet → opus → fable` solo quando un controllo fallisce. La tabella si cambia
nelle istruzioni del progetto con una sezione «Beltline table».

## Test

```
node --test tests/*.test.js
```

## Riconoscimenti

MIT. Riprende idee da [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) (MIT, Affaan
Mustafa) e da [superpowers](https://github.com/obra/superpowers) (MIT, Jesse Vincent). Vedi [NOTICE](NOTICE).
