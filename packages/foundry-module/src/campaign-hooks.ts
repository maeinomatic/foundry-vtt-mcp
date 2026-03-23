// Campaign Dashboard Interactive Hooks
// Implements clickable status toggles using Foundry's native hook system

type CampaignStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

type StatusFlags = Record<string, CampaignStatus>;

type EntryLike = {
  name?: string;
  parent?: EntryLike;
  getFlag: (scope: string, key: string) => unknown;
  setFlag: (scope: string, key: string, value: unknown) => Promise<unknown>;
};

type AppLike = {
  _state?: number;
  closing?: boolean;
  object?: {
    name?: string;
    parent?: { name?: string };
  } & Partial<EntryLike>;
  document?: {
    parent?: EntryLike;
  } & Partial<EntryLike>;
};

export class CampaignHooks {
  private isRegistered: boolean = false;

  constructor(_bridge: unknown) {
    // Bridge not needed for direct Foundry flag approach
  }

  private toJQueryHtml(input: unknown): JQuery<HTMLElement> | null {
    if (input instanceof HTMLElement) {
      return $(input);
    }

    if (input && typeof input === 'object') {
      const record = input as { jquery?: unknown; find?: unknown };
      if (typeof record.jquery === 'string' && typeof record.find === 'function') {
        return input as JQuery<HTMLElement>;
      }
    }

    return null;
  }

  private isEntryLike(value: unknown): value is EntryLike {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const entry = value as { getFlag?: unknown; setFlag?: unknown };
    return typeof entry.getFlag === 'function' && typeof entry.setFlag === 'function';
  }

  private isCampaignStatus(value: unknown): value is CampaignStatus {
    return (
      value === 'not_started' ||
      value === 'in_progress' ||
      value === 'completed' ||
      value === 'skipped'
    );
  }

  private parseStatusFlags(value: unknown): StatusFlags {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const flags: StatusFlags = {};
    for (const [key, status] of Object.entries(value as Record<string, unknown>)) {
      if (this.isCampaignStatus(status)) {
        flags[key] = status;
      }
    }

    return flags;
  }

  private getEntryFromApp(app: AppLike): EntryLike | null {
    let entry: unknown = app.object;

    if (!this.isEntryLike(entry) && app.document) {
      entry = app.document.parent ?? app.document;
    }

    if (this.isEntryLike(entry) && entry.parent) {
      entry = entry.parent;
    }

    if (!this.isEntryLike(entry) && app.document?.parent) {
      entry = app.document.parent;
    }

    return this.isEntryLike(entry) ? entry : null;
  }

  /**
   * Register campaign dashboard hooks
   */
  register(): void {
    if (this.isRegistered) return;

    // Try multiple potential hook names for different Foundry versions
    const hookNames = [
      'renderJournalTextPageSheet',
      'renderJournalPageSheet',
      'renderJournalSheet',
      'renderJournalEntryPageSheet',
      'renderApplication',
    ];

    hookNames.forEach(hookName => {
      Hooks.on(hookName, (app: unknown, html: unknown, data: unknown) => {
        this.onRenderJournalSheet(app, html, data);
      });
    });

    this.isRegistered = true;
  }

  /**
   * Unregister hooks (cleanup)
   */
  unregister(): void {
    if (!this.isRegistered) return;

    // Note: Foundry VTT doesn't have Hooks.off, so we just mark as unregistered
    // The hooks will be cleaned up when the module is disabled

    this.isRegistered = false;
  }

  /**
   * Handle journal sheet rendering to add interactive elements
   */
  private onRenderJournalSheet(app: unknown, html: unknown, _data: unknown): void {
    try {
      const typedApp = (app ?? {}) as AppLike;

      // Extra defensive checks before processing
      if (!app || !html || typedApp._state === -1) {
        return;
      }

      // Small delay to avoid race condition with Foundry's internal DOM manipulation
      setTimeout(() => {
        // Double-check the app is still valid after delay
        if (!app || typedApp._state === -1 || typedApp.closing) {
          return;
        }
        this.processJournalRender(typedApp, html, _data);
      }, 50);
    } catch (error) {
      console.error('Error in journal sheet render handler:', error);
    }
  }

  /**
   * Process journal render after DOM is stable
   */
  private processJournalRender(app: AppLike, html: unknown, _data: unknown): void {
    try {
      // Defensive checks to prevent null errors during journal close/destruction
      if (!app || !html) return;

      // Check if app is being closed or destroyed
      if (app._state === -1 || app.closing) {
        return;
      }

      // Convert html to jQuery if it isn't already
      const $html = this.toJQueryHtml(html);
      if (!$html) {
        return;
      }

      // Additional DOM validation - ensure the HTML element exists and is connected
      if (!$html[0]?.isConnected) {
        return;
      }

      // Only process if this looks like a campaign dashboard
      const entryName = app.object?.name ?? app.object?.parent?.name ?? '';
      const isCampaignDashboard =
        entryName.includes('Campaign Dashboard') ||
        $html.find('.campaign-status-toggle').length > 0;

      if (!isCampaignDashboard) {
        return;
      }

      // Try different ways to get the journal entry
      const entry = this.getEntryFromApp(app);

      // Early return if we can't get a valid entry to save flags to
      if (!entry) {
        return;
      }

      // Load previously saved status flags (if any) for this entry
      const statusFlags = this.parseStatusFlags(entry.getFlag('world', 'campaignStatus'));

      // Find all campaign status toggle elements with defensive error handling
      let statusToggles: JQuery<HTMLElement>;
      try {
        statusToggles = $html.find('.campaign-status-toggle');
      } catch (error) {
        // If DOM query fails, journal is likely being destroyed
        return;
      }

      if (!statusToggles || statusToggles.length === 0) {
        return;
      }

      // Set initial state of each status toggle element based on saved flags
      statusToggles.each((_index: number, element: HTMLElement) => {
        const $element = $(element);
        const campaignIdRaw: unknown = $element.data('campaign-id');
        const partIdRaw: unknown = $element.data('part-id');

        if (typeof campaignIdRaw !== 'string' || typeof partIdRaw !== 'string') {
          console.warn('[Campaign Status] Toggle missing data attributes:', element);
          return;
        }

        const campaignId = campaignIdRaw;
        const partId = partIdRaw;
        const flagKey = `${campaignId}-${partId}`;
        const savedStatus = statusFlags[flagKey];

        if (savedStatus && this.isCampaignStatus(savedStatus)) {
          // Update element to match saved status
          this.updateToggleVisual($element, savedStatus);
        }
      });

      // Attach click handlers to each toggle
      statusToggles.on('click', (event: JQuery.ClickEvent) => {
        void this.onStatusToggleClick(event, entry, statusFlags);
      });
    } catch (error) {
      console.error('Error setting up campaign dashboard interactivity:', error);
    }
  }

  /**
   * Handle status toggle clicks
   */
  private async onStatusToggleClick(
    event: JQuery.ClickEvent,
    entry: EntryLike,
    statusFlags: StatusFlags
  ): Promise<void> {
    try {
      event.preventDefault();
      event.stopPropagation();

      const currentTarget: unknown = event.currentTarget;
      if (!(currentTarget instanceof HTMLElement)) {
        return;
      }

      const target = $(currentTarget);
      const campaignIdRaw: unknown = target.data('campaign-id');
      const partIdRaw: unknown = target.data('part-id');

      if (typeof campaignIdRaw !== 'string' || typeof partIdRaw !== 'string') {
        console.warn('[Campaign Status] Click on toggle missing data attributes');
        return;
      }

      const campaignId = campaignIdRaw;
      const partId = partIdRaw;

      // Only allow GM to modify campaign progress
      if (!game.user?.isGM) {
        ui.notifications?.warn('Only GMs can modify campaign progress');
        return;
      }

      const flagKey = `${campaignId}-${partId}`;
      const currentStatus = this.getCurrentStatus(target);
      const nextStatus = this.getNextStatus(currentStatus);

      // Update visual immediately for responsiveness
      this.updateToggleVisual(target, nextStatus);

      // Update the flags object
      statusFlags[flagKey] = nextStatus;

      try {
        // Persist the new state in the journal entry's flags
        await entry.setFlag('world', 'campaignStatus', statusFlags);

        // Success - no notification banner needed (visual feedback already provided by toggle)
      } catch (error) {
        console.error('[Campaign Status] Failed to save status:', error);
        ui.notifications?.error('Failed to save campaign progress');

        // Revert visual change on error
        this.updateToggleVisual(target, currentStatus);
      }
    } catch (error) {
      console.error('Error handling status toggle click:', error);
      ui.notifications?.error('Failed to update campaign progress');
    }
  }

  /**
   * Get current status from toggle element
   */
  private getCurrentStatus(toggle: JQuery<HTMLElement>): CampaignStatus {
    if (toggle.hasClass('not-started')) return 'not_started';
    if (toggle.hasClass('in-progress')) return 'in_progress';
    if (toggle.hasClass('completed')) return 'completed';
    if (toggle.hasClass('skipped')) return 'skipped';
    return 'not_started'; // default
  }

  /**
   * Get next status in cycle
   */
  private getNextStatus(current: CampaignStatus): CampaignStatus {
    const cycle: CampaignStatus[] = ['not_started', 'in_progress', 'completed', 'skipped'];
    const currentIndex = cycle.indexOf(current);
    const nextIndex = (currentIndex + 1) % cycle.length;
    return cycle[nextIndex];
  }

  /**
   * Update toggle visual appearance
   */
  private updateToggleVisual(toggle: JQuery<HTMLElement>, newStatus: CampaignStatus): void {
    // Remove all status classes
    toggle.removeClass('not-started in-progress completed skipped');

    // Add new status class
    const cssClass = newStatus.replace('_', '-');
    toggle.addClass(cssClass);

    // Update icon and text
    const statusIcon = this.getStatusIcon(newStatus);
    const statusDisplay = this.formatStatus(newStatus);

    toggle.html(`${statusIcon} ${statusDisplay}`);
    toggle.attr('title', `Click to change status: ${statusDisplay}`);
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: CampaignStatus): string {
    const icons = {
      not_started: '⚪',
      in_progress: '🔄',
      completed: '✅',
      skipped: '⏭️',
    };
    return icons[status as keyof typeof icons] || '❓';
  }

  /**
   * Format status for display
   */
  private formatStatus(status: CampaignStatus): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}
