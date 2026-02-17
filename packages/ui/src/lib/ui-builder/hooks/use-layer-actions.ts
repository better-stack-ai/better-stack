import { useCallback } from 'react';
import { useLayerStore } from '@workspace/ui/lib/ui-builder/store/layer-store';
import { useEditorStore } from '@workspace/ui/lib/ui-builder/store/editor-store';
import { duplicateWithNewIdsAndName } from '@workspace/ui/lib/ui-builder/store/layer-utils';
import { canPasteLayer } from '@workspace/ui/lib/ui-builder/utils/paste-validation';

/**
 * Hook that provides layer actions with clipboard support.
 * Uses the global clipboard from editor store for cross-component copy/paste.
 *
 * Clipboard state is read **imperatively** (via `getState()`) rather than
 * through a reactive Zustand selector. This avoids O(N) re-renders across
 * every layer instance whenever a copy/cut occurs. Callers that need a
 * reactive `canPaste` boolean for rendering should subscribe to the clipboard
 * slice directly in that component (see `ContextMenuPortalItems`).
 * 
 * @param layerId - The ID of the layer to operate on (optional, defaults to selected layer)
 * @returns Object with action handlers, permission flags, and an imperative `getCanPaste` check
 */
export function useGlobalLayerActions(layerId?: string) {
  // Layer store — `selectedLayerId` is read imperatively via `getState()`
  // inside each handler (not subscribed) to avoid O(N) re-renders across all
  // layer instances on every selection change while still reading the current
  // value at call time.
  const findLayerById = useLayerStore((state) => state.findLayerById);
  const removeLayer = useLayerStore((state) => state.removeLayer);
  const duplicateLayer = useLayerStore((state) => state.duplicateLayer);
  const addLayerDirect = useLayerStore((state) => state.addLayerDirect);
  const isLayerAPage = useLayerStore((state) => state.isLayerAPage);

  // Editor store — clipboard is read imperatively (not subscribed) to prevent
  // every layer instance from re-rendering on copy/cut operations.
  const componentRegistry = useEditorStore((state) => state.registry);
  const allowPagesCreation = useEditorStore((state) => state.allowPagesCreation);
  const allowPagesDeletion = useEditorStore((state) => state.allowPagesDeletion);
  const setClipboard = useEditorStore((state) => state.setClipboard);
  const clearClipboard = useEditorStore((state) => state.clearClipboard);

  /**
   * Returns the effective layer ID at call time.
   * When `layerId` is provided it is returned directly; otherwise
   * `selectedLayerId` is read from the store snapshot so handlers always
   * operate on the *current* selection rather than a stale closure value.
   */
  const getEffectiveLayerId = useCallback(
    () => layerId ?? useLayerStore.getState().selectedLayerId,
    [layerId]
  );

  /**
   * Copy the layer to clipboard
   */
  const handleCopy = useCallback(() => {
    const effectiveLayerId = getEffectiveLayerId();
    if (!effectiveLayerId) return;

    const layer = findLayerById(effectiveLayerId);
    if (!layer) return;

    // Deep clone the layer with new IDs prepared
    const clonedLayer = duplicateWithNewIdsAndName(layer, false);

    setClipboard({
      layer: clonedLayer,
      isCut: false,
      sourceLayerId: effectiveLayerId,
    });
  }, [getEffectiveLayerId, findLayerById, setClipboard]);

  /**
   * Cut the layer (copy to clipboard and delete)
   */
  const handleCut = useCallback(() => {
    const effectiveLayerId = getEffectiveLayerId();
    if (!effectiveLayerId) return;

    const layer = findLayerById(effectiveLayerId);
    if (!layer) return;

    // Check if we can delete this layer (for pages, check permissions)
    const isPage = isLayerAPage(effectiveLayerId);
    if (isPage && !allowPagesDeletion) return;

    // Deep clone the layer with new IDs prepared
    const clonedLayer = duplicateWithNewIdsAndName(layer, false);

    setClipboard({
      layer: clonedLayer,
      isCut: true,
      sourceLayerId: effectiveLayerId,
    });

    // Delete the original layer
    removeLayer(effectiveLayerId);
  }, [getEffectiveLayerId, findLayerById, isLayerAPage, allowPagesDeletion, removeLayer, setClipboard]);

  /**
   * Paste the clipboard layer into the selected layer.
   */
  const handlePaste = useCallback(() => {
    const effectiveLayerId = getEffectiveLayerId();
    if (!effectiveLayerId) return;

    // Read current clipboard state imperatively to avoid stale closure
    const currentClipboard = useEditorStore.getState().clipboard;
    if (!currentClipboard.layer) return;

    // Validate paste operation
    if (!canPasteLayer(currentClipboard.layer, effectiveLayerId, componentRegistry, findLayerById)) {
      return;
    }

    // Create a new copy with fresh IDs
    const layerToAdd = duplicateWithNewIdsAndName(currentClipboard.layer, false);

    // Add the layer to the target
    addLayerDirect(layerToAdd, effectiveLayerId);

    // If this was a cut operation, clear the clipboard
    if (currentClipboard.isCut) {
      clearClipboard();
    }
  }, [getEffectiveLayerId, componentRegistry, findLayerById, addLayerDirect, clearClipboard]);

  /**
   * Delete the layer
   */
  const handleDelete = useCallback(() => {
    const effectiveLayerId = getEffectiveLayerId();
    if (!effectiveLayerId) return;

    // Check if we can delete this layer (for pages, check permissions)
    const isPage = isLayerAPage(effectiveLayerId);
    if (isPage && !allowPagesDeletion) return;

    removeLayer(effectiveLayerId);
  }, [getEffectiveLayerId, isLayerAPage, allowPagesDeletion, removeLayer]);

  /**
   * Duplicate the layer
   */
  const handleDuplicate = useCallback(() => {
    const effectiveLayerId = getEffectiveLayerId();
    if (!effectiveLayerId) return;

    // Check if we can duplicate this layer (for pages, check permissions)
    const isPage = isLayerAPage(effectiveLayerId);
    if (isPage && !allowPagesCreation) return;

    duplicateLayer(effectiveLayerId);
  }, [getEffectiveLayerId, isLayerAPage, allowPagesCreation, duplicateLayer]);

  /**
   * Imperatively check whether a paste operation is currently valid.
   * Reads clipboard from the store snapshot — does NOT trigger re-renders.
   * Use inside event handlers or keyboard shortcut callbacks.
   */
  const getCanPaste = useCallback(
    (): boolean => {
      const effectiveLayerId = getEffectiveLayerId();
      if (!effectiveLayerId) return false;
      const { clipboard } = useEditorStore.getState();
      if (!clipboard.layer) return false;
      return canPasteLayer(clipboard.layer, effectiveLayerId, componentRegistry, findLayerById);
    },
    [getEffectiveLayerId, componentRegistry, findLayerById]
  );

  // Compute permissions for layer operations.
  // Uses getState() snapshot for render-time values. When `layerId` is provided
  // this is always correct; when omitted it reflects the selection at the time
  // of the most recent render (handlers above read imperatively for call-time
  // correctness).
  const effectiveLayerIdForPermissions = getEffectiveLayerId();
  const isPage = effectiveLayerIdForPermissions ? isLayerAPage(effectiveLayerIdForPermissions) : false;
  const canDuplicate = !isPage || allowPagesCreation;
  const canDelete = !isPage || allowPagesDeletion;
  const canCut = canDelete; // Cut is only possible if we can delete

  return {
    getCanPaste,
    canDuplicate,
    canDelete,
    canCut,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleDuplicate,
  };
}
