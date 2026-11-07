"use client";
import {
	createPostSchema as PostCreateSchema,
	updatePostSchema as PostUpdateSchema,
} from "../../../schemas";

import { hashKey } from "@tanstack/react-query";
import { Button } from "@workspace/ui/components/button";

import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";

import { Switch } from "@workspace/ui/components/switch";
import { Textarea } from "@workspace/ui/components/textarea";
import {
	useSuspensePost,
	useSuspenseEditorialPost,
	useDeletePost,
	usePostForm,
} from "../../hooks/blog-hooks";
import { slugify } from "../../../utils";
import type { SerializedEditorialPost, SerializedPost } from "../../../types";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import {
	lazy,
	memo,
	Suspense,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type FieldPath,
	type FieldValues,
	type SubmitHandler,
	type UseFormReturn,
	useForm,
} from "react-hook-form";
import { z } from "zod";
import { FeaturedImageField } from "./image-field";

const MarkdownEditor = lazy(() =>
	import("./markdown-editor-with-overrides").then((module) => ({
		default: module.MarkdownEditorWithOverrides,
	})),
);
import {
	PermissionAccess,
	useIdentity,
	useStack,
	useNotify,
	usePluginOverrides,
	useTranslate,
	type TranslateFn,
} from "@btst/stack/context";
import { blogPermissions } from "../../../permissions";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_PLUGIN_ID } from "../../constants";
import { EmptyList } from "../shared/empty-list";
import { TagsMultiSelect } from "./tags-multiselect";
import { RevisionHistory } from "../revision-history";
import { EditorialReview } from "../editorial-review";
import { BLOG_EDITORIAL } from "../../localization/blog-editorial";

/**
 * Applies server-side field validation errors (from `StackError.errors`)
 * onto react-hook-form field state, and clears previously applied server
 * errors that are no longer present (e.g. after a resubmit fails on
 * different fields).
 */
function useServerFieldErrors<T extends FieldValues>(
	form: UseFormReturn<T>,
	fieldErrors: Record<string, string | string[]>,
) {
	const appliedFieldsRef = useRef<string[]>([]);

	useEffect(() => {
		// Clear stale server errors from fields that are no longer failing
		for (const field of appliedFieldsRef.current) {
			if (field in fieldErrors) continue;
			const { error } = form.getFieldState(field as FieldPath<T>);
			if (error?.type === "server") {
				form.clearErrors(field as FieldPath<T>);
			}
		}
		appliedFieldsRef.current = Object.keys(fieldErrors);

		for (const [field, message] of Object.entries(fieldErrors)) {
			form.setError(field as FieldPath<T>, {
				type: "server",
				message: Array.isArray(message) ? message.join(", ") : message,
			});
		}
	}, [fieldErrors, form]);
}

type CommonPostFormValues = {
	title: string;
	content: string;
	excerpt?: string;
	slug?: string;
	image?: string;
	published?: boolean;
	tags?: Array<{ name: string } | { id: string; name: string; slug: string }>;
};

function PostFormBody<T extends CommonPostFormValues>({
	form,
	onSubmit,
	submitLabel,
	onCancel,
	disabled,
	errorMessage,
	setFeaturedImageUploading,
	initialSlugTouched = false,
	publishedPermission,
	showPublished = true,
}: {
	form: UseFormReturn<T>;
	onSubmit: SubmitHandler<T>;
	submitLabel: string;
	onCancel: () => void;
	disabled: boolean;
	errorMessage?: string;
	setFeaturedImageUploading: (uploading: boolean) => void;
	initialSlugTouched?: boolean;
	showPublished?: boolean;
	publishedPermission?:
		| ReturnType<typeof blogPermissions.post.create>
		| ReturnType<typeof blogPermissions.post.update>;
}) {
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<BlogPluginOverrides>(BLOG_PLUGIN_ID);
	const [slugTouched, setSlugTouched] = useState(initialSlugTouched);
	const requiredAsterisk =
		localization?.BLOG_FORMS_REQUIRED_ASTERISK ??
		t("blog.forms.requiredAsterisk", " *");
	const nameTitle = "title" as FieldPath<T>;
	const nameSlug = "slug" as FieldPath<T>;
	const nameExcerpt = "excerpt" as FieldPath<T>;
	const nameImage = "image" as FieldPath<T>;
	const nameTags = "tags" as FieldPath<T>;
	const nameContent = "content" as FieldPath<T>;
	const namePublished = "published" as FieldPath<T>;
	const publishedField = (
		<FormField
			control={form.control}
			name={namePublished}
			render={({ field }) => (
				<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
					<div className="space-y-0.5">
						<FormLabel>
							{localization?.BLOG_FORMS_PUBLISHED_LABEL ??
								t("blog.forms.publishedLabel", "Published")}
						</FormLabel>
						<FormDescription>
							{localization?.BLOG_FORMS_PUBLISHED_DESCRIPTION ??
								t(
									"blog.forms.publishedDescription",
									"Toggle to publish immediately",
								)}
						</FormDescription>
					</div>
					<FormControl>
						<Switch checked={!!field.value} onCheckedChange={field.onChange} />
					</FormControl>
				</FormItem>
			)}
		/>
	);
	return (
		<Form {...form}>
			<form className="w-full space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				{errorMessage && (
					<div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-600 text-sm">
						{errorMessage}
					</div>
				)}

				<FormField
					control={form.control}
					name={nameTitle}
					render={({ field }) => (
						<FormItem>
							<FormLabel>
								{localization?.BLOG_FORMS_TITLE_LABEL ??
									t("blog.forms.titleLabel", "Title")}
								<span className="text-destructive">{requiredAsterisk}</span>
							</FormLabel>
							<FormControl>
								<Input
									placeholder={
										localization?.BLOG_FORMS_TITLE_PLACEHOLDER ??
										t("blog.forms.titlePlaceholder", "Enter your post title...")
									}
									{...field}
									value={String(field.value ?? "")}
									onChange={(e) => {
										const newTitle = e.target.value;
										field.onChange(e);
										// Auto-slugify title if slug is not yet set
										if (!slugTouched) {
											// @ts-expect-error - slugify returns string which is compatible with slug field type
											form.setValue(nameSlug, slugify(newTitle));
										}
									}}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={nameSlug}
					render={({ field }) => {
						const currentTitle = form.getValues(nameTitle);
						const autoGeneratedSlug = slugify(String(currentTitle ?? ""));
						const currentSlug = String(field.value ?? "");

						return (
							<FormItem>
								<FormLabel>
									{localization?.BLOG_FORMS_SLUG_LABEL ??
										t("blog.forms.slugLabel", "Slug")}
								</FormLabel>
								<FormControl>
									<Input
										placeholder={
											localization?.BLOG_FORMS_SLUG_PLACEHOLDER ??
											t("blog.forms.slugPlaceholder", "url-friendly-slug")
										}
										{...field}
										value={currentSlug}
										onChange={(e) => {
											const newSlug = e.target.value;
											field.onChange(e);
											// Only mark as touched if the user manually edited to something different from auto-generated
											// This allows auto-generation to continue if the slug matches what would be generated
											if (newSlug !== autoGeneratedSlug) {
												setSlugTouched(true);
											}
										}}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						);
					}}
				/>

				<FormField
					control={form.control}
					name={nameExcerpt}
					render={({ field }) => (
						<FormItem className="flex flex-col">
							<FormLabel>
								{localization?.BLOG_FORMS_EXCERPT_LABEL ??
									t("blog.forms.excerptLabel", "Excerpt")}
								<span className="text-destructive">{requiredAsterisk}</span>
							</FormLabel>
							<FormControl>
								<Textarea
									placeholder={
										localization?.BLOG_FORMS_EXCERPT_PLACEHOLDER ??
										t(
											"blog.forms.excerptPlaceholder",
											"Brief summary of your post...",
										)
									}
									className="min-h-20"
									value={String(field.value ?? "")}
									onChange={field.onChange}
								/>
							</FormControl>
							<FormDescription />
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={nameImage}
					render={({ field }) => (
						<FeaturedImageField
							isRequired={false}
							value={String(field.value ?? "")}
							onChange={field.onChange}
							setFeaturedImageUploading={setFeaturedImageUploading}
						/>
					)}
				/>

				<FormField
					control={form.control}
					name={nameTags}
					render={({ field }) => (
						<FormItem className="flex flex-col">
							<FormLabel>
								{localization?.BLOG_FORMS_TAGS_LABEL ??
									t("blog.forms.tagsLabel", "Tags")}
							</FormLabel>
							<FormControl>
								<TagsMultiSelect
									value={Array.isArray(field.value) ? field.value : []}
									onChange={field.onChange}
									placeholder={
										localization?.BLOG_FORMS_TAGS_PLACEHOLDER ??
										t("blog.forms.tagsPlaceholder", "Enter your post tags...")
									}
								/>
							</FormControl>
							<FormDescription />
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name={nameContent}
					render={({ field }) => (
						<FormItem className="flex flex-col">
							<FormLabel>
								{localization?.BLOG_FORMS_CONTENT_LABEL ??
									t("blog.forms.contentLabel", "Content")}
								<span className="text-destructive">{requiredAsterisk}</span>
							</FormLabel>
							<FormControl>
								<Suspense
									fallback={
										<div className="min-h-80 max-w-full border-input rounded-md border shadow-xs flex items-center justify-center bg-muted/50">
											<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
										</div>
									}
								>
									<MarkdownEditor
										className="min-h-80 max-w-full border-input rounded-md border shadow-xs"
										value={typeof field.value === "string" ? field.value : ""}
										onChange={(content: string) => {
											field.onChange(content);
										}}
									/>
								</Suspense>
							</FormControl>
							<FormDescription />
							<FormMessage />
						</FormItem>
					)}
				/>

				{showPublished &&
					(publishedPermission ? (
						<PermissionAccess permission={publishedPermission}>
							{publishedField}
						</PermissionAccess>
					) : (
						publishedField
					))}

				<div className="flex gap-2 pt-4">
					<Button type="submit" disabled={disabled}>
						{submitLabel}
					</Button>
					<Button
						variant="outline"
						onClick={onCancel}
						disabled={disabled}
						type="button"
					>
						{localization?.BLOG_FORMS_CANCEL_BUTTON ??
							t("blog.forms.cancelButton", "Cancel")}
					</Button>
				</div>
			</form>
		</Form>
	);
}

const CustomPostCreateSchema = PostCreateSchema.omit({
	createdAt: true,
	updatedAt: true,
	publishedAt: true,
});

const CustomPostUpdateSchema = PostUpdateSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	publishedAt: true,
});

/**
 * Required-field validators with translatable messages for the client-side
 * resolver. Server-side validation (`schemas.ts`) is unchanged.
 */
function localizedRequiredFields(t: TranslateFn) {
	return {
		title: z
			.string()
			.min(1, t("blog.forms.validation.titleRequired", "Title is required")),
		content: z
			.string()
			.min(
				1,
				t("blog.forms.validation.contentRequired", "Content is required"),
			),
		excerpt: z
			.string()
			.min(
				1,
				t("blog.forms.validation.excerptRequired", "Excerpt is required"),
			),
		slug: z
			.string()
			.min(1, t("blog.forms.validation.slugRequired", "Slug is required")),
	};
}

type AddPostFormProps = {
	editorialWorkflow?: boolean;
	onClose: () => void;
	onSuccess: (post: { published: boolean; slug?: string }) => void;
	/** Called once with the form instance so parent components can access form state */
	onFormReady?: (
		form: UseFormReturn<z.input<typeof CustomPostCreateSchema>>,
	) => void;
};

const addPostFormPropsAreEqual = (
	prevProps: AddPostFormProps,
	nextProps: AddPostFormProps,
): boolean => {
	if (prevProps.editorialWorkflow !== nextProps.editorialWorkflow) return false;
	if (prevProps.onClose !== nextProps.onClose) return false;
	if (prevProps.onSuccess !== nextProps.onSuccess) return false;
	if (prevProps.onFormReady !== nextProps.onFormReady) return false;
	return true;
};

const AddPostFormComponent = ({
	editorialWorkflow = false,
	onClose,
	onSuccess,
	onFormReady,
}: AddPostFormProps) => {
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const [featuredImageUploading, setFeaturedImageUploading] = useState(false);
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<BlogPluginOverrides>(BLOG_PLUGIN_ID);

	const schema = useMemo(() => {
		const required = localizedRequiredFields(t);
		return CustomPostCreateSchema.extend({
			...required,
			slug: required.slug.optional(),
		});
	}, [t]);

	type AddPostFormValues = z.input<typeof schema>;

	const resourceForm = usePostForm<AddPostFormValues>({
		action: "create",
		successMessage:
			localization?.BLOG_FORMS_TOAST_CREATE_SUCCESS ??
			t("blog.forms.toastCreateSuccess", "Post created successfully"),
		toCreateVars: (data) => ({
			title: data.title,
			content: data.content,
			excerpt: data.excerpt ?? "",
			// Auto-generate slug from title if not provided
			slug: data.slug || slugify(data.title),
			...(editorialWorkflow
				? {}
				: {
						published: data.published ?? false,
						publishedAt: data.published ? new Date() : undefined,
					}),
			image: data.image,
			tags: data.tags || [],
		}),
		onSuccess: (createdPost) => {
			if (editorialWorkflow && !mounted.current) return;
			// Navigate only after mutation (including invalidation) completes
			onSuccess({
				published: createdPost?.published ?? false,
				...(editorialWorkflow ? { slug: createdPost?.slug } : {}),
			});
		},
	});

	const onSubmit = async (data: AddPostFormValues) => {
		await resourceForm.submit(data);
	};

	// For compatibility with resolver types that require certain required fields,
	// cast the generics to the exact inferred input type to avoid mismatch on optional slug
	const form = useForm<z.input<typeof schema>>({
		resolver: zodResolver(schema),
		defaultValues: {
			title: "",
			content: "",
			excerpt: "",
			slug: undefined,
			published: false,
			image: "",
			tags: [],
		},
	});

	// Server-side Zod validation failures land on the matching form fields
	useServerFieldErrors(form, resourceForm.fieldErrors);
	const hasFieldErrors = Object.keys(resourceForm.fieldErrors).length > 0;

	// Expose form instance to parent for AI context integration
	useEffect(() => {
		onFormReady?.(form);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<PostFormBody
			form={form}
			onSubmit={onSubmit}
			showPublished={!editorialWorkflow}
			submitLabel={
				editorialWorkflow && !resourceForm.isSubmitting
					? (localization?.BLOG_EDITORIAL_SAVE_DRAFT ??
						t(
							"blog.editorial.saveDraft",
							BLOG_EDITORIAL.BLOG_EDITORIAL_SAVE_DRAFT,
						))
					: resourceForm.isSubmitting
						? (localization?.BLOG_FORMS_SUBMIT_CREATE_PENDING ??
							t("blog.forms.submitCreatePending", "Creating..."))
						: (localization?.BLOG_FORMS_SUBMIT_CREATE_IDLE ??
							t("blog.forms.submitCreateIdle", "Create Post"))
			}
			onCancel={onClose}
			disabled={resourceForm.isSubmitting || featuredImageUploading}
			errorMessage={hasFieldErrors ? undefined : resourceForm.error?.message}
			setFeaturedImageUploading={setFeaturedImageUploading}
			publishedPermission={blogPermissions.post.create({
				publish: "published",
			})}
		/>
	);
};

function EditorialAddPostForm(props: AddPostFormProps) {
	const { identity } = useIdentity();
	const { api, plugins } = useStack();
	const endpoint = plugins?.[BLOG_PLUGIN_ID]?.api ?? api;
	const scopeKey = hashKey([identity, endpoint?.baseURL, endpoint?.basePath]);
	return <AddPostFormComponent key={scopeKey} {...props} />;
}

function AddPostFormWithMode(props: AddPostFormProps) {
	return props.editorialWorkflow ? (
		<EditorialAddPostForm {...props} />
	) : (
		<AddPostFormComponent {...props} />
	);
}

export const AddPostForm = memo(AddPostFormWithMode, addPostFormPropsAreEqual);

type EditPostFormProps = {
	editorialWorkflow?: boolean;
	postSlug: string;
	onClose: () => void;
	onSuccess: (post: { slug: string; published: boolean }) => void;
	onDelete?: () => void;
	/** Called once with the form instance so parent components can access form state */
	onFormReady?: (
		form: UseFormReturn<z.input<typeof CustomPostUpdateSchema>>,
	) => void;
};

const editPostFormPropsAreEqual = (
	prevProps: EditPostFormProps,
	nextProps: EditPostFormProps,
): boolean => {
	if (prevProps.editorialWorkflow !== nextProps.editorialWorkflow) return false;
	if (prevProps.postSlug !== nextProps.postSlug) return false;
	if (prevProps.onClose !== nextProps.onClose) return false;
	if (prevProps.onSuccess !== nextProps.onSuccess) return false;
	if (prevProps.onDelete !== nextProps.onDelete) return false;
	if (prevProps.onFormReady !== nextProps.onFormReady) return false;
	return true;
};

const LoadedEditPostForm = ({
	post,
	editorialWorkflow = false,
	onReload,
	isCurrentScope,
	postSlug,
	onClose,
	onSuccess,
	onDelete,
	onFormReady,
}: EditPostFormProps & {
	post: SerializedPost | null;
	onReload?: () => Promise<unknown>;
	isCurrentScope?: () => boolean;
}) => {
	const [featuredImageUploading, setFeaturedImageUploading] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<BlogPluginOverrides>(BLOG_PLUGIN_ID);

	const notify = useNotify();

	const schema = useMemo(
		() => CustomPostUpdateSchema.extend(localizedRequiredFields(t)),
		[t],
	);

	type EditPostFormValues = z.input<typeof schema>;

	const resourceForm = usePostForm<EditPostFormValues>({
		action: "edit",
		// Record comes from the suspense hook above — skips useForm's own fetch
		record: post,
		successMessage:
			localization?.BLOG_FORMS_TOAST_UPDATE_SUCCESS ??
			t("blog.forms.toastUpdateSuccess", "Post updated successfully"),
		defaults: (record) =>
			(record
				? {
						title: record.title,
						content: record.content,
						excerpt: record.excerpt,
						slug: record.slug,
						published: editorialWorkflow ? false : record.published,
						image: record.image || "",
						tags: record.tags.map((tag) => ({
							id: tag.id,
							name: tag.name,
							slug: tag.slug,
						})),
					}
				: {}) as EditPostFormValues,
		toUpdateVars: (data, record) => ({
			id: (record as SerializedPost).id,
			data: {
				id: (record as SerializedPost).id,
				expectedVersion: record?.revisionVersion ?? 0,
				title: data.title,
				content: data.content,
				excerpt: data.excerpt ?? "",
				slug: data.slug,
				...(editorialWorkflow
					? {}
					: {
							published: data.published ?? false,
							publishedAt:
								data.published && !record?.published
									? new Date()
									: record?.publishedAt
										? new Date(record.publishedAt)
										: undefined,
						}),
				image: data.image,
				tags: data.tags || [],
			},
		}),
		onSuccess: async (updatedPost) => {
			if (
				editorialWorkflow &&
				(!isCurrentScope?.() ||
					(updatedPost?.slug === postSlug && !(await onReload?.())))
			)
				return;
			// Navigate only after mutation (including invalidation) completes
			onSuccess({
				slug: updatedPost?.slug ?? "",
				published: updatedPost?.published ?? false,
			});
		},
	});

	const { mutateAsync: deletePost, isPending: isDeletingPost } =
		useDeletePost();

	const onSubmit = async (data: EditPostFormValues) => {
		await resourceForm.submit(data);
	};

	const handleDelete = async () => {
		if (!post?.id) return;

		try {
			await deletePost({ id: post.id });
			if (editorialWorkflow && !isCurrentScope?.()) return;
		} catch (error) {
			notify.error(
				error instanceof Error
					? error.message
					: (localization?.BLOG_FORMS_TOAST_DELETE_FAILURE ??
							t("blog.forms.toastDeleteFailure", "Failed to delete post")),
			);
			return;
		}
		notify.success(
			localization?.BLOG_FORMS_TOAST_DELETE_SUCCESS ??
				t("blog.forms.toastDeleteSuccess", "Post deleted successfully"),
		);
		setDeleteDialogOpen(false);

		// Call onDelete callback if provided, otherwise use onClose
		if (onDelete) {
			onDelete();
		} else {
			onClose();
		}
	};

	const form = useForm<z.input<typeof schema>>({
		resolver: zodResolver(schema),
		defaultValues: {
			title: "",
			content: "",
			excerpt: "",
			slug: "",
			published: false,
			image: "",
			tags: [],
		},
		values: resourceForm.defaultValues as z.input<typeof schema>,
	});

	// Server-side Zod validation failures land on the matching form fields
	useServerFieldErrors(form, resourceForm.fieldErrors);
	const hasFieldErrors = Object.keys(resourceForm.fieldErrors).length > 0;

	// Expose form instance to parent for AI context integration
	useEffect(() => {
		onFormReady?.(form);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (!post) {
		return (
			<EmptyList
				message={
					localization?.BLOG_PAGE_NOT_FOUND_DESCRIPTION ??
					t(
						"blog.common.pageNotFoundDescription",
						"The page you are looking for does not exist.",
					)
				}
			/>
		);
	}

	const editFields = (
		<PostFormBody
			showPublished={!editorialWorkflow}
			form={form}
			onSubmit={onSubmit}
			submitLabel={
				editorialWorkflow && !resourceForm.isSubmitting
					? (localization?.BLOG_EDITORIAL_SAVE_CHANGES ??
						t(
							"blog.editorial.saveChanges",
							BLOG_EDITORIAL.BLOG_EDITORIAL_SAVE_CHANGES,
						))
					: resourceForm.isSubmitting
						? (localization?.BLOG_FORMS_SUBMIT_UPDATE_PENDING ??
							t("blog.forms.submitUpdatePending", "Updating..."))
						: (localization?.BLOG_FORMS_SUBMIT_UPDATE_IDLE ??
							t("blog.forms.submitUpdateIdle", "Update Post"))
			}
			onCancel={onClose}
			disabled={resourceForm.isSubmitting || featuredImageUploading}
			errorMessage={
				hasFieldErrors
					? undefined
					: editorialWorkflow && resourceForm.error?.statusCode === 409
						? (localization?.BLOG_EDITORIAL_CONFLICT ??
							t(
								"blog.editorial.conflict",
								BLOG_EDITORIAL.BLOG_EDITORIAL_CONFLICT,
							))
						: resourceForm.error?.message
			}
			setFeaturedImageUploading={setFeaturedImageUploading}
			initialSlugTouched={!!post?.slug}
			publishedPermission={blogPermissions.post.update({
				id: post.id,
				...(post.authorId ? { authorId: post.authorId } : {}),
				publish: post.published ? "unpublish" : "publish",
			})}
		/>
	);

	return (
		<>
			{editorialWorkflow && onReload && (
				<EditorialReview
					post={post as SerializedEditorialPost}
					unsaved={form.formState.isDirty}
					disabled={
						resourceForm.isSubmitting ||
						featuredImageUploading ||
						isDeletingPost
					}
					onReload={onReload}
				/>
			)}
			<PermissionAccess
				permission={blogPermissions.post.history({
					id: post.id,
					...(post.authorId ? { authorId: post.authorId } : {}),
				})}
			>
				<div className="mb-4">
					<RevisionHistory
						post={post}
						disabled={
							resourceForm.isSubmitting ||
							featuredImageUploading ||
							isDeletingPost
						}
						onRestored={async (restored) => {
							if (
								editorialWorkflow &&
								(!isCurrentScope?.() ||
									(restored.slug === postSlug && !(await onReload?.())))
							)
								return;
							onSuccess(restored);
						}}
					/>
				</div>
			</PermissionAccess>
			{editorialWorkflow ? (
				<PermissionAccess
					permission={blogPermissions.post.update({
						id: post.id,
						...(post.authorId ? { authorId: post.authorId } : {}),
						publish: "unchanged",
					})}
					fallback={
						<section
							aria-label={
								localization?.BLOG_EDITORIAL_SAVED_CONTENT ??
								t(
									"blog.editorial.savedContent",
									BLOG_EDITORIAL.BLOG_EDITORIAL_SAVED_CONTENT,
								)
							}
							className="space-y-3 rounded-md border p-4"
						>
							<h2 className="font-semibold">{post.title}</h2>
							<p>{post.excerpt}</p>
							<p className="whitespace-pre-wrap break-words">{post.content}</p>
							<p className="text-sm text-muted-foreground">
								{post.slug} · {post.tags.map((tag) => tag.name).join(", ")}
							</p>
						</section>
					}
				>
					{editFields}
					{editorialWorkflow && resourceForm.error?.statusCode === 409 && (
						<Button
							type="button"
							variant="outline"
							onClick={async () => {
								if (await onReload?.()) resourceForm.clearErrors();
							}}
						>
							{localization?.BLOG_EDITORIAL_REFRESH ??
								t(
									"blog.editorial.refresh",
									BLOG_EDITORIAL.BLOG_EDITORIAL_REFRESH,
								)}
						</Button>
					)}
				</PermissionAccess>
			) : (
				editFields
			)}
			<PermissionAccess
				permission={blogPermissions.post.delete({
					id: post.id,
					...(post.authorId ? { authorId: post.authorId } : {}),
				})}
			>
				<div className="w-full">
					<AlertDialog
						open={deleteDialogOpen}
						onOpenChange={setDeleteDialogOpen}
					>
						<AlertDialogTrigger asChild>
							<Button
								variant="destructive"
								type="button"
								disabled={
									resourceForm.isSubmitting ||
									featuredImageUploading ||
									isDeletingPost
								}
								className="mt-4"
							>
								{localization?.BLOG_FORMS_DELETE_BUTTON ??
									t("blog.forms.deleteButton", "Delete Post")}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									{localization?.BLOG_FORMS_DELETE_DIALOG_TITLE ??
										t("blog.forms.deleteDialogTitle", "Delete Post")}
								</AlertDialogTitle>
								<AlertDialogDescription>
									{localization?.BLOG_FORMS_DELETE_DIALOG_DESCRIPTION ??
										t(
											"blog.forms.deleteDialogDescription",
											"Are you sure you want to delete this post? This action cannot be undone.",
										)}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={isDeletingPost}>
									{localization?.BLOG_FORMS_DELETE_DIALOG_CANCEL ??
										t("blog.forms.deleteDialogCancel", "Cancel")}
								</AlertDialogCancel>
								<AlertDialogAction
									onClick={(e) => {
										e.preventDefault();
										void handleDelete();
									}}
									disabled={isDeletingPost}
								>
									{isDeletingPost
										? (localization?.BLOG_FORMS_DELETE_PENDING ??
											t("blog.forms.deletePending", "Deleting..."))
										: (localization?.BLOG_FORMS_DELETE_DIALOG_CONFIRM ??
											t("blog.forms.deleteDialogConfirm", "Delete"))}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</PermissionAccess>
		</>
	);
};

function SimpleEditPostForm(props: EditPostFormProps) {
	const { post } = useSuspensePost(props.postSlug);
	return <LoadedEditPostForm {...props} post={post} />;
}

function EditorialEditPostForm(props: EditPostFormProps) {
	const { post, refetch, scopeKey, isCurrentScope } = useSuspenseEditorialPost(
		props.postSlug,
	);
	return (
		<LoadedEditPostForm
			key={scopeKey}
			{...props}
			post={post}
			onReload={refetch}
			isCurrentScope={isCurrentScope}
		/>
	);
}

function EditPostFormComponent(props: EditPostFormProps) {
	return props.editorialWorkflow ? (
		<EditorialEditPostForm {...props} />
	) : (
		<SimpleEditPostForm {...props} />
	);
}

export const EditPostForm = memo(
	EditPostFormComponent,
	editPostFormPropsAreEqual,
);
