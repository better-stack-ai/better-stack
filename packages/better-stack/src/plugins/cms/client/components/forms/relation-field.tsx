"use client";

import { useState, useCallback, useMemo } from "react";
import { useContent, useCreateContent } from "../../hooks";
import MultipleSelector from "@workspace/ui/components/multi-select";
import type { Option } from "@workspace/ui/components/multi-select";
import { Button } from "@workspace/ui/components/button";
import { Plus, X } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/auto-form/types";
import type { RelationConfig } from "../../../types";

interface RelationFieldProps extends AutoFormInputComponentProps {
	relation: RelationConfig;
}

/**
 * A form field component for handling CMS content relationships.
 * Supports selecting existing items and optionally creating new items inline.
 *
 * Handles two value formats:
 * - belongsTo: single object { id: string } or undefined
 * - hasMany/manyToMany: array of { id: string }
 */
export function RelationField({
	field,
	fieldConfigItem,
	label,
	isRequired,
	relation,
}: RelationFieldProps) {
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [newItemName, setNewItemName] = useState("");
	const [newItemDescription, setNewItemDescription] = useState("");
	const [createError, setCreateError] = useState<string | null>(null);

	// For belongsTo (single relation), we only allow one selection
	const isSingleSelect = relation.type === "belongsTo";

	// Fetch available items from the target content type
	const { items: availableItems, isLoading } = useContent(relation.targetType, {
		limit: 100, // Load a good chunk for the dropdown
	});

	// Mutation for creating new items
	const createMutation = useCreateContent(relation.targetType);

	// Normalize the field value to an array for internal use
	// belongsTo stores as single object { id }, hasMany/manyToMany store as array
	const normalizedValue = useMemo((): Array<{ id: string }> => {
		if (!field.value) return [];

		if (isSingleSelect) {
			// belongsTo: value is { id: string } or undefined
			const singleValue = field.value as { id?: string } | undefined;
			if (singleValue && singleValue.id) {
				return [{ id: singleValue.id }];
			}
			return [];
		}

		// hasMany/manyToMany: value is array
		return (field.value as Array<{ id: string }>) || [];
	}, [field.value, isSingleSelect]);

	// Convert normalized value to Option[] for MultipleSelector
	const selectedOptions: Option[] = normalizedValue
		.map((v) => {
			const item = availableItems.find((item) => item.id === v.id);
			if (item) {
				const displayValue =
					(item.parsedData as Record<string, unknown>)?.[
						relation.displayField
					] || item.slug;
				return {
					value: item.id,
					label: String(displayValue),
				};
			}
			// Item not found in loaded items - show ID
			return { value: v.id, label: `ID: ${v.id.slice(0, 8)}...` };
		})
		.filter(Boolean);

	// Convert available items to options
	const options: Option[] = availableItems.map((item) => {
		const displayValue =
			(item.parsedData as Record<string, unknown>)?.[relation.displayField] ||
			item.slug;
		return {
			value: item.id,
			label: String(displayValue),
		};
	});

	// Handle selection change - convert back to appropriate format
	const handleChange = useCallback(
		(newOptions: Option[]) => {
			if (isSingleSelect) {
				// belongsTo: store as single object or undefined
				if (newOptions.length > 0) {
					field.onChange({ id: newOptions[0]!.value });
				} else {
					field.onChange(undefined);
				}
			} else {
				// hasMany/manyToMany: store as array
				const newValue = newOptions.map((opt) => ({ id: opt.value }));
				field.onChange(newValue);
			}
		},
		[field, isSingleSelect],
	);

	// Handle creating a new item
	const handleCreateItem = async () => {
		if (!newItemName.trim()) return;

		setCreateError(null);
		try {
			const result = await createMutation.mutateAsync({
				slug: newItemName.toLowerCase().replace(/\s+/g, "-"),
				data: {
					[relation.displayField]: newItemName,
					description: newItemDescription || undefined,
				} as Record<string, unknown>,
			});

			// Add the new item to the selection
			if (isSingleSelect) {
				// belongsTo: replace with new item
				field.onChange({ id: result.id });
			} else {
				// hasMany/manyToMany: append to array
				const newValue = [...normalizedValue, { id: result.id }];
				field.onChange(newValue);
			}

			// Reset and close dialog
			setNewItemName("");
			setNewItemDescription("");
			setIsCreateDialogOpen(false);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to create item. Please try again.";
			setCreateError(message);
		}
	};

	// Handle removing an item
	const handleRemove = useCallback(
		(idToRemove: string) => {
			if (isSingleSelect) {
				// belongsTo: clear the value
				field.onChange(undefined);
			} else {
				// hasMany/manyToMany: filter out the item
				const newValue = normalizedValue.filter((v) => v.id !== idToRemove);
				field.onChange(newValue);
			}
		},
		[normalizedValue, field, isSingleSelect],
	);

	return (
		<div className="space-y-2">
			<Label>
				{label}
				{isRequired && <span className="text-destructive ml-1">*</span>}
			</Label>

			<div className="flex gap-2">
				<div className="flex-1">
					<MultipleSelector
						value={selectedOptions}
						onChange={handleChange}
						options={options}
						placeholder={
							isLoading
								? "Loading..."
								: `Select ${relation.targetType}${isSingleSelect ? "" : "(s)"}...`
						}
						disabled={isLoading}
						hidePlaceholderWhenSelected
						emptyIndicator={
							<p className="text-center text-sm text-muted-foreground py-4">
								No {relation.targetType} items found
							</p>
						}
						maxSelected={isSingleSelect ? 1 : undefined}
						className="min-h-10"
					/>
				</div>

				{/* Create new item button/dialog */}
				{relation.creatable && (
					<Dialog
						open={isCreateDialogOpen}
						onOpenChange={setIsCreateDialogOpen}
					>
						<DialogTrigger asChild>
							<Button type="button" variant="outline" size="icon">
								<Plus className="h-4 w-4" />
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Create New {relation.targetType}</DialogTitle>
							</DialogHeader>
							<div className="space-y-4 py-4">
								{createError && (
									<p className="text-sm text-destructive">{createError}</p>
								)}
								<div className="space-y-2">
									<Label htmlFor="newItemName">
										{relation.displayField.charAt(0).toUpperCase() +
											relation.displayField.slice(1)}
									</Label>
									<Input
										id="newItemName"
										value={newItemName}
										onChange={(e) => setNewItemName(e.target.value)}
										placeholder={`Enter ${relation.displayField}...`}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="newItemDescription">
										Description (optional)
									</Label>
									<Textarea
										id="newItemDescription"
										value={newItemDescription}
										onChange={(e) => setNewItemDescription(e.target.value)}
										placeholder="Enter description..."
										rows={3}
									/>
								</div>
								<div className="flex justify-end gap-2">
									<Button
										type="button"
										variant="outline"
										onClick={() => setIsCreateDialogOpen(false)}
									>
										Cancel
									</Button>
									<Button
										type="button"
										onClick={handleCreateItem}
										disabled={!newItemName.trim() || createMutation.isPending}
									>
										{createMutation.isPending ? "Creating..." : "Create"}
									</Button>
								</div>
							</div>
						</DialogContent>
					</Dialog>
				)}
			</div>

			{/* Show selected items as removable badges */}
			{selectedOptions.length > 0 && (
				<div className="flex flex-wrap gap-1 mt-2">
					{selectedOptions.map((opt) => (
						<div
							key={opt.value}
							className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-secondary text-secondary-foreground"
						>
							<span>{opt.label}</span>
							<button
								type="button"
								onClick={() => handleRemove(opt.value)}
								className="hover:text-destructive"
							>
								<X className="h-3 w-3" />
							</button>
						</div>
					))}
				</div>
			)}

			{fieldConfigItem?.description && (
				<p className="text-sm text-muted-foreground">
					{fieldConfigItem.description}
				</p>
			)}
		</div>
	);
}
