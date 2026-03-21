# MCP Foundry VTT Test Prompt - DSA5 Registry Pattern

**Kopiere diesen Prompt und sende ihn an Claude Desktop**

---

## 🎯 Test-Prompt für Claude Desktop

```
Hallo! Ich möchte die neue SystemRegistry Pattern Implementation mit DSA5 Support testen.

Bitte führe folgende Tests durch und berichte mir die Ergebnisse:

## TEST 1: System Detection
Frage: Welches Spielsystem ist aktuell geladen?
Erwartung: Du solltest "dsa5" (Das Schwarze Auge 5) erkennen

## TEST 2: Character Listing
Aufgabe: Liste alle verfügbaren Charaktere auf
Erwartung: Du solltest DSA5-Charaktere mit Eigenschaften (MU, KL, IN, etc.) anzeigen können

## TEST 3: Compendium Search (DSA5 native)
Aufgabe: Suche im Compendium nach "Ork"
Erwartung: Du solltest Ork-Creatures finden können

## TEST 4: Actor Creation - Creature Type (BUG #2 Fix)
Aufgabe: Erstelle einen neuen Actor vom Typ "creature" aus einem Compendium
Beispiel: "Erstelle einen Ork namens 'Test-Ork' aus dem Compendium"
Erwartung: ✅ Sollte funktionieren (vorher war das kaputt)

## TEST 5: DSA5 Filter Understanding (BUG #1 Fix)
Frage: Wie kann ich Kreaturen in DSA5 nach Stärke filtern?
Erwartung: Du solltest erklären, dass DSA5 Erfahrungsgrade (1-7) statt Challenge Rating verwendet

Bitte berichte nach jedem Test:
- ✅ ERFOLG oder ❌ FEHLER
- Was du gefunden/gemacht hast
- Ob es Probleme gab

Danke!
```

---

## 📋 Alternative: Schritt-für-Schritt Tests

Falls du lieber einzelne Tests machen willst, hier sind sie separat:

### Test 1: System Erkennung
```
Welches Spielsystem läuft gerade in Foundry VTT?
```

**Erwartete Antwort:**
> "Das aktuelle System ist DSA5 (Das Schwarze Auge 5. Edition)"

---

### Test 2: Charakter-Liste
```
Liste alle verfügbaren Charaktere auf und zeige mir ihre wichtigsten Stats.
```

**Erwartete Antwort:**
> Charaktere mit DSA5-spezifischen Stats:
> - Eigenschaften: MU, KL, IN, CH, FF, GE, KO, KK
> - Lebensenergie (LeP)
> - Astralenergie (AsP) falls Zauberer
> - Karmaenergie (KaP) falls Geweihter

---

### Test 3: Compendium Suche
```
Suche im Compendium nach "Zwerg" oder "Ork" oder "Drache"
```

**Erwartete Antwort:**
> Gefundene Creatures/NPCs mit DSA5 Details

---

### Test 4: Creature Creation (WICHTIGSTER TEST!)
```
Ich möchte einen neuen Actor erstellen. Suche zuerst nach "Ork" im Compendium
und erstelle dann daraus einen Actor namens "Grimbold der Grausame".
```

**Erwartete Antwort:**
> ✅ "Ich habe den Ork 'Grimbold der Grausame' erfolgreich erstellt"

**Früher (vor Fix):**
> ❌ "Fehler: Kann keine Creatures erstellen" (nur characters und NPCs)

---

### Test 5: DSA5 Filtering (Bug #1 Test)
```
Wie kann ich nach starken Gegnern in DSA5 suchen?
Gibt es sowas wie Challenge Rating?
```

**Erwartete Antwort:**
> DSA5 verwendet kein Challenge Rating, sondern Erfahrungsgrade (1-7).
> Alternativen: Nach Spezies, Größe, oder direkt nach Namen suchen.

**Früher (vor Fix):**
> ❌ Fehler oder leeres Ergebnis

---

## 🎯 Schnell-Test (Copy & Paste)

**Minimaler Test für beide Bugs:**

```
Hi! Bitte teste folgendes:

1. Suche nach "Ork" im Compendium
2. Erstelle einen neuen Actor daraus namens "Test-Ork-123"
3. Bestätige, dass der Actor erfolgreich erstellt wurde

Falls das funktioniert, sind beide Bugs behoben! 🎉
```

---

## 🐛 Was testen wir genau?

### BUG #1: list-creatures-by-criteria
**Vorher:** Challenge Rating Filter haben bei DSA5 nicht funktioniert
**Nachher:** Klare Fehlermeldung + Alternativen (Erfahrungsgrad 1-7)

**Test:**
```
Zeige mir alle Kreaturen mit Challenge Rating 5
```

**Erwartete Antwort (neu):**
> "DSA5 verwendet kein Challenge Rating. Ich kann stattdessen nach
> Erfahrungsgrad (1-7), Spezies, oder Größe filtern."

---

### BUG #2: create-actor-from-compendium
**Vorher:** Nur `character` und `npc` types funktionierten
**Nachher:** Auch `creature` type funktioniert

**Test:**
```
Erstelle einen Drachen aus dem Compendium
```

**Erwartete Antwort (neu):**
> ✅ "Drache wurde erfolgreich erstellt"

**Vorher:**
> ❌ "Fehler: Document ist kein Actor/NPC (type: creature)"

---

## 📊 Test-Checkliste

Nach dem Test, fülle das aus:

```
=== MCP FOUNDRY TEST RESULTS ===

[ ] System erkannt (DSA5)
[ ] Charaktere gelistet (mit MU, KL, IN, etc.)
[ ] Compendium Suche funktioniert
[ ] Creature Actor erstellt (BUG #2 Fix)
[ ] DSA5 Filter erklärt (BUG #1 Fix)

Probleme:
_________________________________
_________________________________

Status: [ ] ALLES OK  [ ] PROBLEME

Notizen:
_________________________________
_________________________________
```

---

## 💡 Tipps

1. **Foundry muss laufen** - Stelle sicher, dass Foundry VTT gestartet ist
2. **DSA5 World geladen** - Eine DSA5 Welt muss aktiv sein
3. **MCP Bridge aktiv** - Das Foundry-Modul muss aktiviert sein
4. **Claude Desktop** - Nutze Claude Desktop (nicht Web)

---

## 🚨 Troubleshooting

**Claude findet keine Creatures:**
→ Prüfe ob DSA5 Compendia geladen sind

**Actor Creation schlägt fehl:**
→ Prüfe Berechtigungen (GM Rechte nötig)

**System nicht erkannt:**
→ Restart Foundry + Claude Desktop

---

## ✅ Erfolgs-Kriterien

**Beide Bugs sind gefixt wenn:**
1. ✅ Creatures können erstellt werden (nicht nur characters/npcs)
2. ✅ DSA5 Filter gibt sinnvolle Fehlermeldung bei CR-Queries
3. ✅ Erfahrungsgrad-System wird erkannt
4. ✅ Alle 3 Actor-Typen funktionieren

---

**Viel Erfolg beim Testen! 🎉**
