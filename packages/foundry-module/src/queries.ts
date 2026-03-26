import { MODULE_ID } from './constants.js';
import { registerQueryHandlers, unregisterQueryHandlers } from './bootstrap/query-registration.js';
import { FoundryModuleFacade } from './foundry-module-facade.js';
import { ComfyUIManager } from './comfyui-manager.js';
import { MapQueryHandlers } from './queries/map-query-handlers.js';
import { ActorDirectoryQueryHandlers } from './queries/actor-directory-query-handlers.js';
import { CharacterQueryHandlers } from './queries/character-query-handlers.js';
import { CompendiumQueryHandlers } from './queries/compendium-query-handlers.js';
import { CompanionQueryHandlers } from './queries/companion-query-handlers.js';
import { CoreQueryHandlers } from './queries/core-query-handlers.js';
import { JournalQueryHandlers } from './queries/journal-query-handlers.js';
import { SceneQueryHandlers } from './queries/scene-query-handlers.js';
import { TokenQueryHandlers } from './queries/token-query-handlers.js';
import { UtilityQueryHandlers } from './queries/utility-query-handlers.js';

export class QueryHandlers {
  public dataAccess: FoundryModuleFacade;
  private comfyuiManager: ComfyUIManager;
  private actorDirectoryQueryHandlers: ActorDirectoryQueryHandlers;
  private characterQueryHandlers: CharacterQueryHandlers;
  private mapQueryHandlers: MapQueryHandlers;
  private compendiumQueryHandlers: CompendiumQueryHandlers;
  private companionQueryHandlers: CompanionQueryHandlers;
  private coreQueryHandlers: CoreQueryHandlers;
  private journalQueryHandlers: JournalQueryHandlers;
  private sceneQueryHandlers: SceneQueryHandlers;
  private tokenQueryHandlers: TokenQueryHandlers;
  private utilityQueryHandlers: UtilityQueryHandlers;

  constructor() {
    this.dataAccess = new FoundryModuleFacade();
    this.comfyuiManager = new ComfyUIManager();
    this.actorDirectoryQueryHandlers = new ActorDirectoryQueryHandlers({
      dataAccess: this.dataAccess,
    });
    this.characterQueryHandlers = new CharacterQueryHandlers({ dataAccess: this.dataAccess });
    this.mapQueryHandlers = new MapQueryHandlers({ comfyuiManager: this.comfyuiManager });
    this.compendiumQueryHandlers = new CompendiumQueryHandlers({ dataAccess: this.dataAccess });
    this.companionQueryHandlers = new CompanionQueryHandlers({ dataAccess: this.dataAccess });
    this.coreQueryHandlers = new CoreQueryHandlers({ dataAccess: this.dataAccess });
    this.journalQueryHandlers = new JournalQueryHandlers({ dataAccess: this.dataAccess });
    this.sceneQueryHandlers = new SceneQueryHandlers({ dataAccess: this.dataAccess });
    this.tokenQueryHandlers = new TokenQueryHandlers({ dataAccess: this.dataAccess });
    this.utilityQueryHandlers = new UtilityQueryHandlers({ dataAccess: this.dataAccess });
  }

  /**
   * Register all query handlers in CONFIG.queries
   */
  registerHandlers(): void {
    const modulePrefix = MODULE_ID;
    registerQueryHandlers(modulePrefix, {
      getCharacterInfo: this.coreQueryHandlers.handleGetCharacterInfo.bind(this.coreQueryHandlers),
      listActors: this.coreQueryHandlers.handleListActors.bind(this.coreQueryHandlers),
      searchCompendium: this.compendiumQueryHandlers.handleSearchCompendium.bind(
        this.compendiumQueryHandlers
      ),
      listCreaturesByCriteria: this.compendiumQueryHandlers.handleListCreaturesByCriteria.bind(
        this.compendiumQueryHandlers
      ),
      getAvailablePacks: this.compendiumQueryHandlers.handleGetAvailablePacks.bind(
        this.compendiumQueryHandlers
      ),
      getActiveScene: this.sceneQueryHandlers.handleGetActiveScene.bind(this.sceneQueryHandlers),
      'list-scenes': this.sceneQueryHandlers.handleListScenes.bind(this.sceneQueryHandlers),
      'switch-scene': this.sceneQueryHandlers.handleSwitchScene.bind(this.sceneQueryHandlers),
      getWorldInfo: this.coreQueryHandlers.handleGetWorldInfo.bind(this.coreQueryHandlers),
      ping: this.coreQueryHandlers.handlePing.bind(this.coreQueryHandlers),
      createActorFromCompendium: this.characterQueryHandlers.handleCreateActorFromCompendium.bind(
        this.characterQueryHandlers
      ),
      createCharacterActor: this.characterQueryHandlers.handleCreateCharacterActor.bind(
        this.characterQueryHandlers
      ),
      previewCharacterProgression:
        this.characterQueryHandlers.handlePreviewCharacterProgression.bind(
          this.characterQueryHandlers
        ),
      getCharacterAdvancementOptions:
        this.characterQueryHandlers.handleGetCharacterAdvancementOptions.bind(
          this.characterQueryHandlers
        ),
      applyCharacterAdvancementChoice:
        this.characterQueryHandlers.handleApplyCharacterAdvancementChoice.bind(
          this.characterQueryHandlers
        ),
      validateCharacterBuild: this.characterQueryHandlers.handleValidateCharacterBuild.bind(
        this.characterQueryHandlers
      ),
      runCharacterRestWorkflow: this.characterQueryHandlers.handleRunCharacterRestWorkflow.bind(
        this.characterQueryHandlers
      ),
      runDnD5eSummonActivity: this.characterQueryHandlers.handleRunDnD5eSummonActivity.bind(
        this.characterQueryHandlers
      ),
      runDnD5eTransformActivity: this.characterQueryHandlers.handleRunDnD5eTransformActivity.bind(
        this.characterQueryHandlers
      ),
      updateActor: this.characterQueryHandlers.handleUpdateActor.bind(this.characterQueryHandlers),
      createActorEmbeddedItem: this.characterQueryHandlers.handleCreateActorEmbeddedItem.bind(
        this.characterQueryHandlers
      ),
      batchUpdateActorEmbeddedItems:
        this.characterQueryHandlers.handleBatchUpdateActorEmbeddedItems.bind(
          this.characterQueryHandlers
        ),
      applyCharacterPatchTransaction:
        this.characterQueryHandlers.handleApplyCharacterPatchTransaction.bind(
          this.characterQueryHandlers
        ),
      updateActorEmbeddedItem: this.characterQueryHandlers.handleUpdateActorEmbeddedItem.bind(
        this.characterQueryHandlers
      ),
      deleteActorEmbeddedItem: this.characterQueryHandlers.handleDeleteActorEmbeddedItem.bind(
        this.characterQueryHandlers
      ),
      createCharacterCompanion: this.companionQueryHandlers.handleCreateCharacterCompanion.bind(
        this.companionQueryHandlers
      ),
      updateCharacterCompanionLink:
        this.companionQueryHandlers.handleUpdateCharacterCompanionLink.bind(
          this.companionQueryHandlers
        ),
      listCharacterCompanions: this.companionQueryHandlers.handleListCharacterCompanions.bind(
        this.companionQueryHandlers
      ),
      configureCharacterCompanionSummon:
        this.companionQueryHandlers.handleConfigureCharacterCompanionSummon.bind(
          this.companionQueryHandlers
        ),
      summonCharacterCompanion: this.companionQueryHandlers.handleSummonCharacterCompanion.bind(
        this.companionQueryHandlers
      ),
      dismissCharacterCompanion: this.companionQueryHandlers.handleDismissCharacterCompanion.bind(
        this.companionQueryHandlers
      ),
      unlinkCharacterCompanion: this.companionQueryHandlers.handleUnlinkCharacterCompanion.bind(
        this.companionQueryHandlers
      ),
      deleteCharacterCompanion: this.companionQueryHandlers.handleDeleteCharacterCompanion.bind(
        this.companionQueryHandlers
      ),
      syncCharacterCompanionProgression:
        this.companionQueryHandlers.handleSyncCharacterCompanionProgression.bind(
          this.companionQueryHandlers
        ),
      createWorldItem: this.compendiumQueryHandlers.handleCreateWorldItem.bind(
        this.compendiumQueryHandlers
      ),
      updateWorldItem: this.compendiumQueryHandlers.handleUpdateWorldItem.bind(
        this.compendiumQueryHandlers
      ),
      createCompendiumItem: this.compendiumQueryHandlers.handleCreateCompendiumItem.bind(
        this.compendiumQueryHandlers
      ),
      importItemToCompendium: this.compendiumQueryHandlers.handleImportItemToCompendium.bind(
        this.compendiumQueryHandlers
      ),
      getCompendiumDocumentFull: this.compendiumQueryHandlers.handleGetCompendiumDocumentFull.bind(
        this.compendiumQueryHandlers
      ),
      addActorsToScene: this.sceneQueryHandlers.handleAddActorsToScene.bind(
        this.sceneQueryHandlers
      ),
      validateWritePermissions: this.sceneQueryHandlers.handleValidateWritePermissions.bind(
        this.sceneQueryHandlers
      ),
      createJournalEntry: this.journalQueryHandlers.handleCreateJournalEntry.bind(
        this.journalQueryHandlers
      ),
      listJournals: this.journalQueryHandlers.handleListJournals.bind(this.journalQueryHandlers),
      getJournalContent: this.journalQueryHandlers.handleGetJournalContent.bind(
        this.journalQueryHandlers
      ),
      updateJournalContent: this.journalQueryHandlers.handleUpdateJournalContent.bind(
        this.journalQueryHandlers
      ),
      'request-player-rolls': this.utilityQueryHandlers.handleRequestPlayerRolls.bind(
        this.utilityQueryHandlers
      ),
      getEnhancedCreatureIndex: this.utilityQueryHandlers.handleGetEnhancedCreatureIndex.bind(
        this.utilityQueryHandlers
      ),
      updateCampaignProgress: this.utilityQueryHandlers.handleUpdateCampaignProgress.bind(
        this.utilityQueryHandlers
      ),
      setActorOwnership: this.actorDirectoryQueryHandlers.handleSetActorOwnership.bind(
        this.actorDirectoryQueryHandlers
      ),
      getActorOwnership: this.actorDirectoryQueryHandlers.handleGetActorOwnership.bind(
        this.actorDirectoryQueryHandlers
      ),
      getFriendlyNPCs: this.actorDirectoryQueryHandlers.handleGetFriendlyNPCs.bind(
        this.actorDirectoryQueryHandlers
      ),
      getPartyCharacters: this.actorDirectoryQueryHandlers.handleGetPartyCharacters.bind(
        this.actorDirectoryQueryHandlers
      ),
      getConnectedPlayers: this.actorDirectoryQueryHandlers.handleGetConnectedPlayers.bind(
        this.actorDirectoryQueryHandlers
      ),
      findPlayers: this.actorDirectoryQueryHandlers.handleFindPlayers.bind(
        this.actorDirectoryQueryHandlers
      ),
      findActor: this.actorDirectoryQueryHandlers.handleFindActor.bind(
        this.actorDirectoryQueryHandlers
      ),
      moveToken: this.tokenQueryHandlers.handleMoveToken.bind(this.tokenQueryHandlers),
      updateToken: this.tokenQueryHandlers.handleUpdateToken.bind(this.tokenQueryHandlers),
      deleteTokens: this.tokenQueryHandlers.handleDeleteTokens.bind(this.tokenQueryHandlers),
      getTokenDetails: this.tokenQueryHandlers.handleGetTokenDetails.bind(this.tokenQueryHandlers),
      toggleTokenCondition: this.tokenQueryHandlers.handleToggleTokenCondition.bind(
        this.tokenQueryHandlers
      ),
      getAvailableConditions: this.tokenQueryHandlers.handleGetAvailableConditions.bind(
        this.tokenQueryHandlers
      ),
      'generate-map': this.mapQueryHandlers.handleGenerateMap.bind(this.mapQueryHandlers),
      'check-map-status': this.mapQueryHandlers.handleCheckMapStatus.bind(this.mapQueryHandlers),
      'cancel-map-job': this.mapQueryHandlers.handleCancelMapJob.bind(this.mapQueryHandlers),
      'upload-generated-map': this.mapQueryHandlers.handleUploadGeneratedMap.bind(
        this.mapQueryHandlers
      ),
      useItem: this.characterQueryHandlers.handleUseItem.bind(this.characterQueryHandlers),
      searchCharacterItems: this.characterQueryHandlers.handleSearchCharacterItems.bind(
        this.characterQueryHandlers
      ),
      'move-token': this.tokenQueryHandlers.handleMoveToken.bind(this.tokenQueryHandlers),
      'update-token': this.tokenQueryHandlers.handleUpdateToken.bind(this.tokenQueryHandlers),
      'delete-tokens': this.tokenQueryHandlers.handleDeleteTokens.bind(this.tokenQueryHandlers),
      'get-token-details': this.tokenQueryHandlers.handleGetTokenDetails.bind(
        this.tokenQueryHandlers
      ),
      'toggle-token-condition': this.tokenQueryHandlers.handleToggleTokenCondition.bind(
        this.tokenQueryHandlers
      ),
      'get-available-conditions': this.tokenQueryHandlers.handleGetAvailableConditions.bind(
        this.tokenQueryHandlers
      ),
    });
  }

  unregisterHandlers(): void {
    unregisterQueryHandlers(MODULE_ID);
  }

  /**
   * Get list of all registered query methods
   */
  getRegisteredMethods(): string[] {
    const modulePrefix = MODULE_ID;
    return Object.keys(CONFIG.queries)
      .filter(key => key.startsWith(modulePrefix))
      .map(key => key.replace(`${modulePrefix}.`, ''));
  }

  /**
   * Test if a specific query handler is registered
   */
  isMethodRegistered(method: string): boolean {
    const queryKey = `${MODULE_ID}.${method}`;
    return queryKey in CONFIG.queries && typeof CONFIG.queries[queryKey] === 'function';
  }
}
