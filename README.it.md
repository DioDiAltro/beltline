# Beltline

*Una catena di montaggio di agenti per Claude Code.*
[Read in English](README.md)

Progetti il lavoro con Claude finché è chiaro, dai il via, e poi una squadra di agenti lo costruisce senza che tu debba
starci dietro: prima i modelli economici, quelli più forti solo quando un controllo fallisce, macchine e revisori nuovi
che controllano ogni pezzo, muri (hook) che bloccano le mosse pericolose, un registro su disco che sopravvive alle
compattazioni e ai limiti d'uso, e un contatore che dice dove è finito ogni token. Ogni lavoro lascia lezioni per il
successivo.

Come in un gioco di fabbriche, è fatta di macchine separate collegate da nastri. Ogni macchina è una skill, un agente o
un hook, e si può usare anche da sola.

```
 design ──► schematic ──► VIA ──► recruit ──► worker ──► verify ──► ledger ──► lessons ──► sweep
(parlare)   (piano)              (assumere) (costruire) (controllo) (magazzino) (imparare)  (pulizia)
     ▲ council (scelte difficili)        simplifier    inspector · scout · reviewer · cacciatori
      muri: guard-bash · guard-files · done-gate     contatori: costi · capo · contesto
```

## Installazione

```
/plugin marketplace add DioDiAltro/beltline
/plugin install beltline@beltline
```

Serve **Node.js 18 o più nel PATH**: gli hook sono script Node. L'installazione nativa di Claude Code non installa Node,
e un hook che non parte non blocca niente, quindi senza Node muri e contatori sono spenti senza avvisi (il capo
controlla `node --version` prima del via). Funziona meglio con il plugin [superpowers](https://github.com/obra/superpowers):
design e schematic passano alle sue skill di brainstorming e di piano quando c'è.

Consigliato per i lavori lunghi: compattare molto prima del limite del modello, per esempio con `/autocompact 200k`,
oppure `"autoCompactWindow": 200000` in `.claude/settings.json`. Lo stato è nel registro, quindi la compattazione non
perde niente.

## Uso

Scrivi «usa beltline:capo per costruire …», o affida semplicemente un lavoro di codice grande. Per riprendere dopo una
pausa, una compattazione o un limite d'uso: «riprendi il lavoro». Di' «modalità dettagliata» se vuoi vedere ogni passo;
di base è silenziosa: un solo riepilogo alla fine.

Le skill e gli agenti sono scritti in inglese, ma Claude parla con te nella tua lingua.

## Le macchine

| Pezzo | Tipo | Cosa fa |
|---|---|---|
| `capo` | skill | Il direttore: porta il nastro dalla progettazione al riepilogo, decide invece di fermarsi, tiene piccolo il proprio contesto |
| `design` | skill | Capisce il lavoro con te, una domanda alla volta, e scrive il documento di progetto |
| `council` | skill | Quattro voci discutono una scelta difficile, così non vince per forza la prima idea |
| `schematic` | skill | Trasforma il progetto in compiti con file precisi, controlli di fine, una tabella dei file in comune e un contratto |
| `recruit` | skill | Sceglie agente, modello ed effort; scrive istruzioni e perimetro; sale di livello se fallisce |
| `verify` | skill | Macchine → esploratore e cacciatori → revisione con due verdetti; l'autore non si rivede mai da solo |
| `ledger` | skill | La cartella del lavoro in `.capo/` che sopravvive alle compattazioni; ripresa; costi |
| `lessons` | skill | Trasforma errori, correzioni, costi e dati sul contesto in regole brevi |
| `sweep` | skill | Toglie documenti, file di `.capo`, worktree e rami dei lavori che risultano finiti; tiene un indice |
| `worker` | agente | Costruisce un compito, prima il test, dentro il suo perimetro e la sua copia del codice |
| `inspector` | agente | Esegue i controlli a macchina di un compito e risponde con il risultato in tre righe, così il capo non legge i log |
| `scout` | agente | Cerca senza modificare; usa il grafo del codice (graphify) se c'è |
| `reviewer` | agente | Revisione a contesto pulito: ha fatto ciò che era chiesto, è fatto bene, cosa non può verificare |
| `silent-failure-hunter` | agente | Errori ingoiati e ripieghi che nascondono i guasti |
| `test-analyzer` | agente | I test coprono il comportamento o esistono e basta? |
| `simplifier` | agente | Ripulisce il codice già verde senza cambiarne il comportamento |
| `guard-bash` | hook | Blocca push, `--no-verify`, stash, reset --hard, merge, cambi di rami e di storia, scritture sui file di controllo, anche dentro comandi su più righe, `bash -c`, `eval` e PowerShell |
| `guard-files` | hook | Ogni agente che modifica può toccare solo i file del suo compito, dentro la sua copia del codice |
| `done-gate` | hook | Un worker non può dire DONE senza la riga di stato e un rapporto con controlli veri |
| `cost-meter` | hook | Token, dimensione del contesto e risultati più grossi di ogni agente, nel `costs.jsonl` del lavoro |
| `capo-meter` | hook | Lo stesso per la sessione principale, la più cara |
| `context-meter` | hook | Avvisa il capo una volta a 150K, 250K, 400K e 600K token di aggiornare il registro e leggere meno |
| `context-restore` | hook | Dopo una compattazione o in una sessione nuova, indica a Claude il registro del lavoro in corso |

Due script li accompagnano: `scripts/costs.js` (il rapporto dei costi di un lavoro) e `scripts/bite.js` (i test nuovi
falliscono sul codice di prima del compito?).

I muri valgono solo per gli agenti del kit: tu e la tua sessione principale non venite mai bloccati. Sono protezioni
contro abitudini ed errori, non una sandbox: un programma scritto apposta per aggirarli ci riuscirebbe. Solo la
sessione principale crea agenti e unisce i rami; le versioni recenti di Claude Code permettono ai sottoagenti di crearne
altri, ma Beltline non ci si appoggia, quindi i lavori grandi si dividono in zone fatte una dopo l'altra.

## Il contesto

Quello che entra in una conversazione si paga una volta per scriverlo nella cache dei prompt, poi si rilegge a ogni
passo fino a una compattazione. Beltline tiene fuori quello che non serve, invece di comprimerlo dopo:

- **Fuori dall'origine.** L'output di prove e build va nei file di log; gli agenti rispondono con quattro righe;
  controlli a macchina, ricerche e foto li leggono gli agenti, non il capo.
- **Su disco, cercabile.** Registro, istruzioni, rapporti e controlli di un lavoro stanno in `.capo/<lavoro>/`: una
  compattazione o una sessione nuova non perdono niente, e i dettagli si trovano con `grep` invece di rileggere.
- **Misurato.** I contatori segnano quanto è cresciuto ogni contesto e quali risultati l'hanno riempito; `costs.js` e
  `lessons` ne fanno regole per il lavoro dopo.
- **Detto in tempo.** Il contatore del contesto avvisa il capo a soglie fisse; dopo una compattazione l'hook di avvio
  lo rimanda al registro.

Nessun proxy sta tra Claude Code e l'API, e niente riscrive la conversazione: la cache dei prompt continua a
funzionare.

## Dove vanno i file

Ogni lavoro tiene progetto e piano in `docs/beltline/AAAA-MM-GG-<nome>/`, con in cima `status: active | done`, e i
file di lavoro in `.capo/AAAA-MM-GG-<nome>/` (ignorata da git); `.capo/active` dice qual è il lavoro in corso. Quando il
lavoro è finito e controllato, `sweep` toglie tutti e due (chiedendo prima, se il contratto non dice sì) e aggiunge una
riga in `docs/beltline/INDEX.md` con il commit da cui recuperarli e il costo del lavoro.

## Modelli

Il più economico che basta: `haiku` per i compiti meccanici con l'elenco completo, `sonnet` per le funzioni e i
controlli, `opus` per il codice delicato; si sale `haiku → sonnet → opus → fable` solo quando un controllo fallisce, e un
compito parte più in alto solo per un motivo scritto nel piano. La tabella si cambia nelle istruzioni del progetto con
una sezione «Beltline table».

## Aggiornare dalla 0.2

Un lavoro iniziato con la 0.2 tiene i suoi file direttamente in `.capo/`. «Riprendi il lavoro» li sposta in
`.capo/<lavoro>/` e continua. I muri leggono tutte e due le forme.

## Test

```
node --test tests/*.test.js
```

## Riconoscimenti

MIT. Riprende idee da [Everything Claude Code](https://github.com/affaan-m/everything-claude-code) (MIT, Affaan
Mustafa) e da [superpowers](https://github.com/obra/superpowers) (MIT, Jesse Vincent). Vedi [NOTICE](NOTICE).
