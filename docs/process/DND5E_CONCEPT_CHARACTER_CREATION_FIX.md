# DnD5e Concept Character Creation Fix

## Scope

This note analyzes the live request to create a DnD5e level 3 sorcerer named Benny Danton and documents the concrete fix required to make this class of request produce a character whose identity and mechanics actually match the requested concept.

## Original Intent

The user intent was concept-driven character creation:

- create a new DnD5e character
- class: Sorcerer
- level: 3
- name: Danny Phantom
- expected outcome: the resulting actor should not only have the right class and level, but should also have matching biography, story, identity, and other descriptive data instead of inherited source-template content

This is not the same as "clone an existing starter hero and rename it".

## Actual Tool Call Sequence

The relevant live calls were:

1. Connection verification

```json
{
  "tool": "list-characters",
  "args": { "type": "character" }
}
```

2. Actor compendium discovery

```json
{
  "tool": "list-compendium-packs",
  "args": { "type": "Actor" }
}
```

3. Sorcerer source search

```json
{
  "tool": "search-compendium",
  "args": {
    "query": "sorcerer",
    "packType": "Actor",
    "limit": 10
  }
}
```

This returned:

- `Morthos (Tiefling Sorcerer)` from `dnd5e.heroes`

4. Source inspection

```json
{
  "tool": "get-compendium-entry-full",
  "args": {
    "packId": "dnd5e.heroes",
    "entryId": "xT2C2Itv2XambDYp"
  }
}
```

```json
{
  "tool": "get-compendium-item",
  "args": {
    "packId": "dnd5e.heroes",
    "itemId": "xT2C2Itv2XambDYp",
    "compact": true
  }
}
```

5. Character creation workflow

```json
{
  "tool": "create-dnd5e-character-workflow",
  "args": {
    "sourceUuid": "Compendium.dnd5e.heroes.Actor.xT2C2Itv2XambDYp",
    "name": "Danny Phantom",
    "targetLevel": 3
  }
}
```

6. Validation

```json
{
  "tool": "validate-dnd5e-character-build",
  "args": {
    "actorIdentifier": "Danny Phantom"
  }
}
```

The actor was created successfully as `Danny Phantom` at level 3.

## What Made Sense

The following choices were reasonable in the narrow context of "get a level 3 sorcerer actor created through the DnD5e workflow":

- verifying that the Foundry bridge was live before attempting creation
- searching Actor compendiums for a sorcerer-compatible source
- using `create-dnd5e-character-workflow` instead of a campaign tool or a plain clone tool
- validating the finished actor instead of assuming success from the initial tool response

So the tool family was correct.

## What Did Not Make Sense

The semantic source choice was wrong for the actual user intent.

We used a named starter-hero actor as the creation template:

- `Compendium.dnd5e.heroes.Actor.xT2C2Itv2XambDYp`
- label: `Morthos (Tiefling Sorcerer)`

That means the workflow started from a fully-authored character concept with its own:

- biography/story
- race/background defaults
- spells and subclass choices
- advancement history shape

For a request like "create Danny Phantom", this is only valid if the user explicitly asked to clone Morthos and rename him. That did not happen.

## Exact Failure Modes

### 1. Only name and level were actually passed into creation

The live creation payload was:

```json
{
  "sourceUuid": "Compendium.dnd5e.heroes.Actor.xT2C2Itv2XambDYp",
  "name": "Danny Phantom",
  "targetLevel": 3
}
```

No biography, gender, story, profile, appearance, or concept metadata was sent.

That means the system had no chance to produce concept-faithful identity data. Any matching on those fields would have had to happen by accident.

### 2. The workflow clones a source actor and only optionally overwrites biography

Current implementation in `handleCreateDnD5eCharacterWorkflow`:

- clones the compendium actor with `createActorFromCompendium`
- overrides only `name`
- only updates `system.details.biography.value` if `biography` is explicitly present in the tool args

Current behavior therefore preserves source identity content unless the caller explicitly replaces it.

Consequence:

- name became `Danny Phantom`
- source biography remained Morthos-derived because no `biography` value was passed

### 3. The workflow has no DnD5e identity/customization surface beyond biography

The DnD5e workflow currently accepts:

- `sourceUuid`
- `name`
- `targetLevel`
- optional `classIdentifier`
- optional `advancementSelections`
- optional `biography`

It does not accept a DnD5e character customization object for:

- gender
- appearance
- alignment
- profile details
- concept notes
- bonds, ideals, flaws, or similar story fields

So even if the natural-language request included that information, the workflow surface could not represent it.

### 4. The selected source actor was not progression-clean for this workflow

Validation after creation reported four unresolved required advancement steps:

- `Saving Throws`
- `Skills`
- `Sorcerous Origin`
- `Weapon Proficiencies`

The resulting actor also already contained subclass-related items such as:

- `Draconic Bloodline`
- `Dragon Ancestor`
- `Draconic Resilience`

This indicates the source/template path is mixing:

- baked actor content already present on the template
- unresolved advancement records still seen by the DnD5e workflow

So the workflow produced a mechanically inconsistent actor:

- class level was correct
- some class features/items existed
- required advancement bookkeeping was still unresolved

### 5. Success was reported too early for a concept-creation outcome

The top-level tool result reported success even though follow-up validation still found errors.

For concept-driven character creation, that is the wrong success definition.

The creation should only be considered successful if all of the following are true:

- requested identity/customization data has been applied
- no source-template biography/story remains unless explicitly preserved
- no unresolved required advancement steps remain
- validation has no build errors

## Root Cause Summary

The failure is not one single bug. It is a chain of four issues:

1. Request interpretation gap
2. Wrong source-template strategy for concept creation
3. Incomplete tool schema for identity customization
4. DnD5e progression finalization bug or incompatible source actor for this workflow

## Concrete Fix

## Fix Goal

For a request like:

- "Create a level 3 sorcerer named Danny Phantom"

the system must create a new concept-faithful actor, not a renamed pre-authored hero.

## Fix 1: Split Concept Creation from Template Cloning

Add an explicit concept-driven path instead of overloading `create-dnd5e-character-workflow` with named hero templates.

Recommended rule:

- If the user asks to create a new character concept, do not use `dnd5e.heroes` or any other pre-authored named PC actor as the default source.
- Only use a named actor template when the user explicitly asks to clone or adapt that exact actor.

Implementation options:

1. Preferred: add a new tool such as `create-dnd5e-character-from-concept`.
2. Acceptable: extend `create-dnd5e-character-workflow` with a `mode` or `customization` object and disallow named-hero templates in concept mode.

## Fix 2: Add a DnD5e Customization Payload

Extend the DnD5e creation workflow to accept a structured customization object.

Minimum fields:

```json
{
  "customization": {
    "biography": "string",
    "gender": "string",
    "alignment": "string",
    "appearance": "string",
    "profile": {
      "race": "string",
      "background": "string",
      "notes": "string"
    }
  }
}
```

Important requirement:

- this layer must map concept fields to DnD5e actor updates in one place
- agents should not guess raw DnD5e field paths ad hoc during a live run

## Fix 3: Never Preserve Source Biography by Default in Concept Mode

If a concept-driven request uses any actor template at all, the workflow should clear source-authored identity text unless explicitly told to preserve it.

Required default behavior in concept mode:

- overwrite `name`
- if `biography` was provided, write it
- if `biography` was not provided, clear inherited biography instead of preserving source text
- clear or overwrite other source-specific profile text fields that would leak the template character identity

Recommended option:

```json
{
  "preserveSourceProfile": false
}
```

with `false` as the default for concept-driven requests.

## Fix 4: Do Not Return Success While Required Advancements Remain Unresolved

Change the create workflow success contract.

Current behavior:

- returns success when actor creation and level update complete, even if validation still reports required unresolved advancements

Required behavior:

- if `validate-dnd5e-character-build` reports any `error`
- or if `outstandingAdvancementCount > 0`
- then top-level workflow result must be partial or failed, not successful

Recommended return contract:

- `success: true` only when validation has no errors and no unresolved required advancements
- otherwise return `success: false` with explicit remediation details

## Fix 5: Reject or Sanitize Incompatible Source Actors

Before using a source actor as a leveling template, inspect it for DnD5e progression integrity.

If the source actor already contains baked class/subclass items but unresolved advancement state, either:

1. reject it as a concept-creation source, or
2. sanitize/reconcile it before continuing

For this request class, rejecting is safer.

Suggested rule:

- `dnd5e.heroes` starter characters are valid for demo cloning
- they are not valid as default sources for concept-faithful creation workflows

## Fix 6: Add an Orchestration Layer That Preserves User Intent

The agent/tool bridge should convert a natural-language concept request into a structured creation plan before calling Foundry tools.

For this request class, the plan should contain at least:

```json
{
  "intent": "create-new-character-concept",
  "name": "Danny Phantom",
  "class": "Sorcerer",
  "targetLevel": 3,
  "requestedBiography": "...if present in the user prompt...",
  "requestedGender": "...if present in the user prompt...",
  "requestedStory": "...if present in the user prompt..."
}
```

Then the orchestration layer must choose a creation workflow that can actually represent those fields.

## Concrete Code Changes

### Files to change

- `packages/mcp-server/src/tools/character.ts`
- `packages/mcp-server/src/tools/character.test.ts`
- optionally a new DnD5e concept-creation service under `packages/mcp-server/src/systems/dnd5e/` or `packages/mcp-server/src/domains/characters/`

### Required implementation changes

1. Extend the DnD5e creation args schema with a `customization` object.
2. Add a `preserveSourceProfile` flag defaulting to `false` in concept mode.
3. Apply customization updates immediately after actor creation.
4. If no biography is provided in concept mode, blank inherited biography fields.
5. Run validation before returning final success.
6. If unresolved advancements remain, return a non-success result and surface the exact pending steps.
7. Block named starter-hero templates for concept mode unless the caller explicitly opts in.

## Tests To Add

1. Concept creation does not preserve source biography.
2. Concept creation with no biography clears source biography instead of inheriting it.
3. Concept creation with biography writes the requested biography.
4. Concept creation from a named starter hero either fails fast or sanitizes the actor before returning success.
5. Workflow returns `success: false` when validation still shows unresolved required advancements.
6. Concept request fields are preserved end to end in the final actor state.

## Practical Short-Term Workaround

Until the code fix exists, a live agent run should do all of the following instead of only calling `create-dnd5e-character-workflow` with `name` and `targetLevel`:

1. avoid `dnd5e.heroes` unless explicit cloning is intended
2. if a template must be used, immediately overwrite or clear source biography/profile text
3. run post-creation `update-character` for concept text fields that the workflow does not set
4. run `validate-dnd5e-character-build`
5. do not report success if required advancement steps remain unresolved

This workaround is still weaker than the proper fix because the current DnD5e workflow surface does not cleanly represent the full concept payload.

## Bottom Line

For the Danny Phantom request, the wrong thing was not the final tool family. The wrong thing was treating a concept-creation request as a renamed clone of `Morthos (Tiefling Sorcerer)`.

The concrete fix is to introduce a concept-safe DnD5e creation path that:

- preserves the user request as structured character data
- does not inherit source hero identity text by default
- rejects incompatible pre-authored sources for concept creation
- refuses to report success while required advancements are still unresolved

## Policy For Omitted Fields

For MCP design, omitted input should not mean random generation by default.

That distinction matters because there are three different states:

1. omitted because the user does not care
2. omitted because the user has not provided enough information yet
3. explicitly requested random generation

Those are not equivalent.

### Recommended Standard

Use this rule set for concept-driven character creation:

- omitted semantic fields must remain unset, inherited from a neutral baseline only when system-required, or trigger a clarification workflow if they are required to fulfill the request safely
- random generation must always be explicit
- opinionated narrative defaults must always be explicit
- deterministic technical defaults are acceptable when they do not change character identity or story intent

### What Counts As Safe Implicit Defaults

Safe implicit defaults are fields that are operational rather than conceptual, for example:

- `addToScene: false`
- default placement mode when `addToScene` is true
- deterministic validation behavior
- deterministic progression behavior where the system has only one legal choice

These defaults are acceptable because they do not invent story content or character identity.

### What Must Not Be Implicitly Invented

The workflow should not silently invent or randomize identity-bearing fields such as:

- biography
- gender
- personality/story text
- appearance description
- alignment
- bonds, ideals, flaws
- origin details
- voice/style/concept notes

If those values were not provided, the tool should not fabricate them unless the caller explicitly asks for generation.

### Why This Is The Better MCP Standard

This is the safer MCP design because it keeps tool behavior:

- deterministic
- auditable
- intent-preserving
- portable across clients and agents

If omission implicitly means random generation, then two clients making the same call can get materially different concept outcomes from the same tool contract. That is bad workflow design for MCP because the tool becomes less predictable and harder to compose.

### Recommended API Shape

The cleanest contract is to distinguish omitted, explicit defaults, and explicit randomization in the schema.

Recommended shape:

```json
{
  "customization": {
    "biography": {
      "mode": "preserve" | "clear" | "set" | "generate",
      "value": "optional string"
    },
    "gender": {
      "mode": "preserve" | "set" | "generate",
      "value": "optional string"
    },
    "appearance": {
      "mode": "preserve" | "clear" | "set" | "generate",
      "value": "optional string"
    }
  }
}
```

If that is too heavy for v1, the minimum viable rule should be:

- omitted means do not invent
- `generateMissingIdentity: true` must be explicit if generation is desired
- `applyDefaultIdentity: true` must be explicit if opinionated defaults are desired

### Recommendation For This Repository

For this project's intended purpose, the best default is:

- explicit randomization only
- explicit opinionated defaults only
- omission means no invented semantic content

That matches the repo's broader direction toward deterministic, user-intent-preserving tools and avoids creating an MCP that feels clever but produces low-trust results.

### Practical Behavior For A Request Like This One

For a request such as:

- "Create a level 3 sorcerer named Danny Phantom"

the workflow should:

- create the actor with the requested name and level
- avoid inheriting source-authored biography/story by default
- leave biography/gender/appearance unset unless explicitly provided
- optionally return a structured note listing which concept fields are still unspecified

If the user instead wants generation, that should be explicit, for example:

- "Generate a random backstory and appearance"
- "Use default lore-neutral placeholder values for unspecified identity fields"

That is the correct distinction.

### Practical Behavior Examples

#### Example 1: Explicit Randomization

User request:

- "Create a level 3 sorcerer named Ember Voss. Randomize the backstory, appearance, and personality, but keep the class, level, and name exactly as given."

Correct MCP interpretation:

- `name` is fixed
- `class` is fixed
- `targetLevel` is fixed
- identity generation is allowed only for the fields explicitly marked as random

Example structured intent:

```json
{
  "intent": "create-new-character-concept",
  "name": "Ember Voss",
  "class": "Sorcerer",
  "targetLevel": 3,
  "customization": {
    "biography": { "mode": "generate" },
    "appearance": { "mode": "generate" },
    "personality": { "mode": "generate" }
  }
}
```

Expected behavior:

- the actor is created as Ember Voss
- class and level are exactly as requested
- generated narrative fields are clearly marked as tool-generated or surfaced in the result payload
- no unrelated fields are invented beyond the fields explicitly authorized for generation
- if the source template contains authored identity text, it is replaced or cleared instead of leaking through

#### Example 2: Very Specific Character

User request:

- "Create a level 3 sorcerer named Danny Phantom. He is a young male human with white hair and green eyes. His biography should describe him as a haunted but determined ghost-touched hero from a small mining town. Do not randomize anything."

Correct MCP interpretation:

- all specified identity fields are fixed
- generation is forbidden because the user explicitly disallowed it
- unspecified semantic fields remain unset or neutral rather than invented

Example structured intent:

```json
{
  "intent": "create-new-character-concept",
  "name": "Danny Phantom",
  "class": "Sorcerer",
  "targetLevel": 3,
  "customization": {
    "gender": { "mode": "set", "value": "male" },
    "species": { "mode": "set", "value": "human" },
    "appearance": {
      "mode": "set",
      "value": "young man with white hair and green eyes"
    },
    "biography": {
      "mode": "set",
      "value": "A haunted but determined ghost-touched hero from a small mining town."
    }
  },
  "generateMissingIdentity": false
}
```

Expected behavior:

- the actor is created as Danny Phantom
- class and level are exactly as requested
- biography and appearance reflect the supplied text
- no random backstory, traits, or defaults are invented
- any unsupported requested fields are reported back explicitly instead of being silently dropped

#### Design Implication

These two examples show the intended standard:

- randomization is a capability, not a fallback
- specificity from the user must always override any template/default behavior
- omission must never be reinterpreted as permission to improvise semantic content
