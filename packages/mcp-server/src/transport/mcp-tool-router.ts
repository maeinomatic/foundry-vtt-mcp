import { ActorCreationTools } from '../tools/actor-creation.js';
import { CampaignManagementTools } from '../tools/campaign-management.js';
import { CharacterTools } from '../tools/character.js';
import { CompendiumTools } from '../tools/compendium.js';
import { DiceRollTools } from '../tools/dice-roll.js';
import { OwnershipTools } from '../tools/ownership.js';
import { QuestCreationTools } from '../tools/quest-creation.js';
import { SceneTools } from '../tools/scene.js';
import { TokenManipulationTools } from '../tools/token-manipulation.js';
import { MapGenerationTools } from '../tools/map-generation.js';
import { DSA5CharacterCreator } from '../systems/dsa5/character-creator.js';

export interface MpcToolRouterDependencies {
  characterTools: CharacterTools;
  compendiumTools: CompendiumTools;
  sceneTools: SceneTools;
  actorCreationTools: ActorCreationTools;
  dsa5CharacterCreator: DSA5CharacterCreator;
  questCreationTools: QuestCreationTools;
  diceRollTools: DiceRollTools;
  campaignManagementTools: CampaignManagementTools;
  ownershipTools: OwnershipTools;
  tokenManipulationTools: TokenManipulationTools;
  mapGenerationTools: MapGenerationTools;
}

export async function dispatchMcpToolCall(
  name: string,
  args: unknown,
  dependencies: MpcToolRouterDependencies
): Promise<unknown> {
  const {
    characterTools,
    compendiumTools,
    sceneTools,
    actorCreationTools,
    dsa5CharacterCreator,
    questCreationTools,
    diceRollTools,
    campaignManagementTools,
    ownershipTools,
    tokenManipulationTools,
    mapGenerationTools,
  } = dependencies;

  switch (name) {
    case 'get-character':
      return characterTools.handleGetCharacter(args);
    case 'list-characters':
      return characterTools.handleListCharacters(args);
    case 'get-character-entity':
      return characterTools.handleGetCharacterEntity(args);
    case 'use-item':
      return characterTools.handleUseItem(args);
    case 'search-character-items':
      return characterTools.handleSearchCharacterItems(args);
    case 'update-character':
      return characterTools.handleUpdateCharacter(args);
    case 'update-character-resources':
      return characterTools.handleUpdateCharacterResources(args);
    case 'set-character-ability-scores':
      return characterTools.handleSetCharacterAbilityScores(args);
    case 'set-character-skill-proficiencies':
      return characterTools.handleSetCharacterSkillProficiencies(args);
    case 'batch-update-character-items':
      return characterTools.handleBatchUpdateCharacterItems(args);
    case 'apply-character-patch-transaction':
      return characterTools.handleApplyCharacterPatchTransaction(args);
    case 'add-character-item':
      return characterTools.handleAddCharacterItem(args);
    case 'add-dnd5e-class-to-character':
      return characterTools.handleAddDnD5eClassToCharacter(args);
    case 'complete-dnd5e-multiclass-entry-workflow':
      return characterTools.handleCompleteDnD5eMulticlassEntryWorkflow(args);
    case 'update-character-item':
      return characterTools.handleUpdateCharacterItem(args);
    case 'remove-character-item':
      return characterTools.handleRemoveCharacterItem(args);
    case 'learn-dnd5e-spell':
      return characterTools.handleLearnDnD5eSpell(args);
    case 'prepare-dnd5e-spell':
      return characterTools.handlePrepareDnD5eSpell(args);
    case 'forget-dnd5e-spell':
      return characterTools.handleForgetDnD5eSpell(args);
    case 'set-dnd5e-spell-slots':
      return characterTools.handleSetDnD5eSpellSlots(args);
    case 'set-dnd5e-proficiencies':
      return characterTools.handleSetDnD5eProficiencies(args);
    case 'reassign-dnd5e-spell-source-class':
      return characterTools.handleReassignDnD5eSpellSourceClass(args);
    case 'validate-dnd5e-spellbook':
      return characterTools.handleValidateDnD5eSpellbook(args);
    case 'validate-dnd5e-character-build':
      return characterTools.handleValidateDnD5eCharacterBuild(args);
    case 'bulk-reassign-dnd5e-spell-source-class':
      return characterTools.handleBulkReassignDnD5eSpellSourceClass(args);
    case 'set-dnd5e-prepared-spells':
      return characterTools.handleSetDnD5ePreparedSpells(args);
    case 'run-dnd5e-rest-workflow':
      return characterTools.handleRunDnD5eRestWorkflow(args);
    case 'run-dnd5e-group-rest-workflow':
      return characterTools.handleRunDnD5eGroupRestWorkflow(args);
    case 'complete-dnd5e-level-up-workflow':
      return characterTools.handleCompleteDnD5eLevelUpWorkflow(args);
    case 'create-dnd5e-character-workflow':
      return characterTools.handleCreateDnD5eCharacterWorkflow(args);
    case 'award-dnd5e-party-resources':
      return characterTools.handleAwardDnD5ePartyResources(args);
    case 'run-dnd5e-summon-activity':
      return characterTools.handleRunDnD5eSummonActivity(args);
    case 'run-dnd5e-transform-activity-workflow':
      return characterTools.handleRunDnD5eTransformActivityWorkflow(args);
    case 'organize-dnd5e-spellbook-workflow':
      return characterTools.handleOrganizeDnD5eSpellbookWorkflow(args);
    case 'create-character-companion':
      return characterTools.handleCreateCharacterCompanion(args);
    case 'update-character-companion-link':
      return characterTools.handleUpdateCharacterCompanionLink(args);
    case 'list-character-companions':
      return characterTools.handleListCharacterCompanions(args);
    case 'configure-character-companion-summon':
      return characterTools.handleConfigureCharacterCompanionSummon(args);
    case 'summon-character-companion':
      return characterTools.handleSummonCharacterCompanion(args);
    case 'dismiss-character-companion':
      return characterTools.handleDismissCharacterCompanion(args);
    case 'unlink-character-companion':
      return characterTools.handleUnlinkCharacterCompanion(args);
    case 'delete-character-companion':
      return characterTools.handleDeleteCharacterCompanion(args);
    case 'sync-character-companion-progression':
      return characterTools.handleSyncCharacterCompanionProgression(args);
    case 'preview-character-progression':
      return characterTools.handlePreviewCharacterProgression(args);
    case 'get-character-advancement-options':
      return characterTools.handleGetCharacterAdvancementOptions(args);
    case 'apply-character-advancement-choice':
      return characterTools.handleApplyCharacterAdvancementChoice(args);
    case 'update-character-progression':
      return characterTools.handleUpdateCharacterProgression(args);
    case 'search-compendium':
      return compendiumTools.handleSearchCompendium(args);
    case 'get-compendium-item':
      return compendiumTools.handleGetCompendiumItem(args);
    case 'list-creatures-by-criteria':
      return compendiumTools.handleListCreaturesByCriteria(args);
    case 'list-compendium-packs':
      return compendiumTools.handleListCompendiumPacks(args);
    case 'create-world-item':
      return compendiumTools.handleCreateWorldItem(args);
    case 'update-world-item':
      return compendiumTools.handleUpdateWorldItem(args);
    case 'create-compendium-item':
      return compendiumTools.handleCreateCompendiumItem(args);
    case 'import-item-to-compendium':
      return compendiumTools.handleImportItemToCompendium(args);
    case 'get-current-scene':
      return sceneTools.handleGetCurrentScene(args);
    case 'get-world-info':
      return sceneTools.handleGetWorldInfo(args);
    case 'create-actor-from-compendium':
      return actorCreationTools.handleCreateActorFromCompendium(args);
    case 'create-character-actor':
      return actorCreationTools.handleCreateCharacterActor(args);
    case 'get-compendium-entry-full':
      return actorCreationTools.handleGetCompendiumEntryFull(args);
    case 'create-dsa5-character-from-archetype':
      return dsa5CharacterCreator.handleCreateCharacterFromArchetype(args);
    case 'list-dsa5-archetypes':
      return dsa5CharacterCreator.handleListArchetypes(args);
    case 'create-quest-journal':
      return questCreationTools.handleCreateQuestJournal(args);
    case 'link-quest-to-npc':
      return questCreationTools.handleLinkQuestToNPC(args);
    case 'update-quest-journal':
      return questCreationTools.handleUpdateQuestJournal(args);
    case 'list-journals':
      return questCreationTools.handleListJournals(args);
    case 'search-journals':
      return questCreationTools.handleSearchJournals(args);
    case 'request-player-rolls':
      return diceRollTools.handleRequestPlayerRolls(args);
    case 'create-campaign-dashboard':
      return campaignManagementTools.handleCreateCampaignDashboard(args);
    case 'assign-actor-ownership':
      return ownershipTools.handleToolCall('assign-actor-ownership', args);
    case 'remove-actor-ownership':
      return ownershipTools.handleToolCall('remove-actor-ownership', args);
    case 'list-actor-ownership':
      return ownershipTools.handleToolCall('list-actor-ownership', args);
    case 'move-token':
      return tokenManipulationTools.handleMoveToken(args);
    case 'update-token':
      return tokenManipulationTools.handleUpdateToken(args);
    case 'delete-tokens':
      return tokenManipulationTools.handleDeleteTokens(args);
    case 'get-token-details':
      return tokenManipulationTools.handleGetTokenDetails(args);
    case 'toggle-token-condition':
      return tokenManipulationTools.handleToggleTokenCondition(args);
    case 'get-available-conditions':
      return tokenManipulationTools.handleGetAvailableConditions(args);
    case 'generate-map':
      return mapGenerationTools.generateMap(args);
    case 'check-map-status':
      return mapGenerationTools.checkMapStatus(args);
    case 'cancel-map-job':
      return mapGenerationTools.cancelMapJob(args);
    case 'list-scenes':
      return mapGenerationTools.listScenes(args);
    case 'switch-scene':
      return mapGenerationTools.switchScene(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
