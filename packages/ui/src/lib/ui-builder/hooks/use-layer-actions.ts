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
  // Layer store
  // NOTE: `selectedLayerId` is read imperatively (not subscribed) because every
  // current caller always provides `layerId`. A reactive subscription would
  // cause O(N) re-renders across all layer instances on every selection change.
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

  // Get the effective layer ID — falls back to selectedLayerId imperatively
  // to avoid a reactive subscription that would fire on every selection change.
  const effectiveLayerId = layerId ?? useLayerStore.getState().selectedLayerId;

  /**
   * Copy the layer to clipboard
   */
  const handleCopy = useCallback(() => {
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
  }, [effectiveLayerId, findLayerById, setClipboard]);

  /**
   * Cut the layer (copy to clipboard and delete)
   */
  const handleCut = useCallback(() => {
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
  }, [effectiveLayerId, findLayerById, isLayerAPage, allowPagesDeletion, removeLayer, setClipboard]);

  /**
   * Paste the clipboard layer into the selected layer.
   */
  const handlePaste = useCallback(() => {
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
  }, [effectiveLayerId, componentRegistry, findLayerById, addLayerDirect, clearClipboard]);

  /**
   * Delete the layer
   */
  const handleDelete = useCallback(() => {
    if (!effectiveLayerId) return;

    // Check if we can delete this layer (for pages, check permissions)
    const isPage = isLayerAPage(effectiveLayerId);
    if (isPage && !allowPagesDeletion) return;

    removeLayer(effectiveLayerId);
  }, [effectiveLayerId, isLayerAPage, allowPagesDeletion, removeLayer]);

  /**
   * Duplicate the layer
   */
  const handleDuplicate = useCallback(() => {
    if (!effectiveLayerId) return;

    // Check if we can duplicate this layer (for pages, check permissions)
    const isPage = isLayerAPage(effectiveLayerId);
    if (isPage && !allowPagesCreation) return;

    duplicateLayer(effectiveLayerId);
  }, [effectiveLayerId, isLayerAPage, allowPagesCreation, duplicateLayer]);

  /**
   * Imperatively check whether a paste operation is currently valid.
   * Reads clipboard from the store snapshot — does NOT trigger re-renders.
   * Use inside event handlers or keyboard shortcut callbacks.
   */
  const getCanPaste = useCallback(
    (): boolean => {
      if (!effectiveLayerId) return false;
      const { clipboard } = useEditorStore.getState();
      if (!clipboard.layer) return false;
      return canPasteLayer(clipboard.layer, effectiveLayerId, componentRegistry, findLayerById);
    },
    [effectiveLayerId, componentRegistry, findLayerById]
  );

  // Compute permissions for layer operations
  const isPage = effectiveLayerId ? isLayerAPage(effectiveLayerId) : false;
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
