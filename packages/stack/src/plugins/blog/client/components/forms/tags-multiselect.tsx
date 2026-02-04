import MultipleSelector, {
	type Option,
} from "@workspace/ui/components/multi-select";
import { useTags } from "../../hooks/blog-hooks";
import type { SerializedTag } from "../../../types";

export function TagsMultiSelect({
	value,
	onChange,
	placeholder,
}: {
	value: Array<{ name: string } | { id: string; name: string; slug: string }>;
	onChange: (
		value: Array<{ name: string } | { id: string; name: string; slug: string }>,
	) => void;
	placeholder?: string;
}) {
	const { tags } = useTags();

	const tagMap = new Map<string, SerializedTag>();
	const idToTagMap = new Map<string, SerializedTag>();
	(tags || []).forEach((tag) => {
		tagMap.set(tag.name.toLowerCase(), tag);
		tagMap.set(tag.slug, tag);
		idToTagMap.set(tag.id, tag);
	});

	const options: Option[] = (tags || []).map((tag) => ({
		value: tag.id,
		label: tag.name,
	}));

	const selectedOptions: Option[] = (value || []).map((tag) => {
		if ("id" in tag && tag.id) {
			return {
				value: tag.id,
				label: tag.name,
			};
		}
		const existingTag = tagMap.get(tag.name.toLowerCase());
		return {
			value: existingTag?.id || tag.name,
			label: tag.name,
		};
	});

	const handleChange = (newOptions: Option[]) => {
		const tagObjects = newOptions.map((option) => {
			const existingTag =
				idToTagMap.get(option.value) ||
				Array.from(tagMap.values()).find(
					(tag) => tag.name.toLowerCase() === option.value.toLowerCase(),
				);

			if (existingTag) {
				return {
					id: existingTag.id,
					name: existingTag.name,
					slug: existingTag.slug,
				};
			}

			return { name: option.value };
		});
		onChange(tagObjects);
	};

	return (
		<MultipleSelector
			value={selectedOptions}
			onChange={handleChange}
			placeholder={placeholder ?? "Search or create tags..."}
			options={options}
			creatable={true}
			hidePlaceholderWhenSelected={true}
			className="w-full"
		/>
	);
}
