"use client";

import { useFormContext } from "react-hook-form";
import { usePluginOverrides } from "@btst/stack/context";
import {
	FormControl,
	FormItem,
	FormMessage,
} from "@workspace/ui/components/form";
import AutoFormLabel from "@workspace/ui/components/auto-form/common/label";
import AutoFormTooltip from "@workspace/ui/components/auto-form/common/tooltip";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/auto-form/types";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { FORM_BUILDER_PLUGIN_ID } from "../../constants";

export function MediaFileField({
	field,
	fieldProps,
	fieldConfigItem,
	label,
	isRequired,
}: AutoFormInputComponentProps) {
	const form = useFormContext();
	const { imageInputField: ImageInput, imagePicker: ImagePicker } =
		usePluginOverrides<FormBuilderPluginOverrides>(FORM_BUILDER_PLUGIN_ID);
	const select = (url: string) => {
		if (fieldProps.disabled || form.formState.isSubmitting) return;
		field.onChange(url);
		void form.trigger(field.name);
	};
	return (
		<FormItem>
			<AutoFormLabel
				label={fieldConfigItem.label || label}
				isRequired={isRequired}
			/>
			<FormControl>
				<div
					role="group"
					aria-label={fieldConfigItem.label || label}
					inert={fieldProps.disabled || form.formState.isSubmitting}
				>
					{ImageInput ? (
						<ImageInput value={field.value ?? ""} onChange={select} />
					) : ImagePicker ? (
						<ImagePicker onSelect={select} />
					) : null}
				</div>
			</FormControl>
			<AutoFormTooltip fieldConfigItem={fieldConfigItem} />
			<FormMessage />
		</FormItem>
	);
}
